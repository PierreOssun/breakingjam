//! Argon2id password hashing, run off the async runtime.

use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};

use crate::error::AppError;

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
