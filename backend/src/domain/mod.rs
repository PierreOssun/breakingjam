//! Domain types and their invariants; no SQL here.

pub mod event;
pub mod user;

use validator::ValidationError;

/// Validator for required text: rejects empty and whitespace-only strings.
pub fn not_blank(value: &str) -> Result<(), ValidationError> {
    if value.trim().is_empty() {
        return Err(ValidationError::new("blank").with_message("must not be blank".into()));
    }
    Ok(())
}
