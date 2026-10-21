//! Argon2id password hashing, run off the async runtime.

use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};

use crate::error::AppError;

/// A hash no password matches: a login with no stored hash still pays for a verification.
pub const NO_PASSWORD: &str = "$argon2id$v=19$m=19456,t=2,p=1$ALj5DAocdl+FjiyMu0SW/A$nuQb+Ay+PU5PB4aogFIV+I+3PIKCNTN8NCgz//2qxlE";

/// Hashes a password into a PHC string with a random salt.
pub async fn hash(password: String) -> Result<String, AppError> {
    // Argon2 is deliberately slow (tens of ms); keep it off the request threads.
    tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes())
            .map(|hash| hash.to_string())
            .map_err(|err| AppError::Internal(anyhow::anyhow!("hash password: {err}")))
    })
    .await
    .map_err(|err| AppError::Internal(err.into()))?
}

/// Whether `password` matches the stored PHC `hash`.
pub async fn verify(password: String, hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&hash)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("parse password hash: {err}")))?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    })
    .await
    .map_err(|err| AppError::Internal(err.into()))?
}
