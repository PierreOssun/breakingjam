//! Argon2id password hashing with the site's pepper, run off the async runtime.

use argon2::{
    Algorithm, Argon2, Params, Version,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};

use tokio::sync::Semaphore;

use crate::{config::Secret, error::AppError};

/// A hash no password matches: a login with no stored hash still pays for a verification.
pub const NO_PASSWORD: &str = "$argon2id$v=19$m=19456,t=2,p=1$ALj5DAocdl+FjiyMu0SW/A$nuQb+Ay+PU5PB4aogFIV+I+3PIKCNTN8NCgz//2qxlE";

/// Hashes running at once; anonymous login and register floods queue here.
// Each hash takes 19 MiB and a CPU slice: two keep the 1 GiB, 1/4 vCPU container alive.
pub(crate) static ARGON2_SLOTS: Semaphore = Semaphore::const_new(2);

/// Hashes a password into a PHC string with a random salt and the `pepper`.
pub async fn hash(password: String, pepper: &Secret) -> Result<String, AppError> {
    let pepper = pepper.0.clone();
    with_slot(move || {
        argon2(&pepper)?
            .hash_password(password.as_bytes())
            .map(|hash| hash.to_string())
            .map_err(|err| AppError::Internal(anyhow::anyhow!("hash password: {err}")))
    })
    .await
}

/// Whether `password` matches the stored PHC `hash` under the `pepper`.
pub async fn verify(password: String, hash: String, pepper: &Secret) -> Result<bool, AppError> {
    let pepper = pepper.0.clone();
    with_slot(move || {
        let parsed = PasswordHash::new(&hash)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("parse password hash: {err}")))?;
        Ok(argon2(&pepper)?
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    })
    .await
}

/// Argon2id with default params, keyed with the pepper: a stolen database alone can't be cracked.
fn argon2(pepper: &str) -> Result<Argon2<'_>, AppError> {
    Argon2::new_with_secret(
        pepper.as_bytes(),
        Algorithm::Argon2id,
        Version::V0x13,
        Params::default(),
    )
    .map_err(|err| AppError::Internal(anyhow::anyhow!("argon2 with pepper: {err}")))
}

/// Runs Argon2 `work` off the request threads once a slot is free.
async fn with_slot<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    let slot = ARGON2_SLOTS
        .acquire()
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    tokio::task::spawn_blocking(move || {
        // Held until the hash ends, even if the client hangs up and the request is dropped.
        let _slot = slot;
        work()
    })
    .await
    .map_err(|err| AppError::Internal(err.into()))?
}
