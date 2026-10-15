//! Domain types and their invariants; no SQL here.

pub mod battle;
pub mod claim;
pub mod crew;
pub mod dancer;
pub mod event;
pub mod organizer;
pub mod user;

use validator::ValidationError;

/// A failed struct-level rule; `code` carries the field name, which `AppError` reports.
pub fn rule(field: &'static str, message: &'static str) -> ValidationError {
    ValidationError::new(field).with_message(message.into())
}

/// Validator for required text: rejects empty and whitespace-only strings.
pub fn not_blank(value: &str) -> Result<(), ValidationError> {
    if value.trim().is_empty() {
        return Err(ValidationError::new("blank").with_message("must not be blank".into()));
    }
    Ok(())
}

/// `len` upper-case ASCII letters: the shape of ISO 3166-1 alpha-2 and ISO 4217 codes.
pub fn upper_ascii_code(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| b.is_ascii_uppercase())
}

/// Validator for ISO 3166-1 alpha-2 country codes, upper case (shape only).
pub fn country_code(value: &str) -> Result<(), ValidationError> {
    if upper_ascii_code(value, 2) {
        return Ok(());
    }
    Err(ValidationError::new("country")
        .with_message("must be an ISO 3166-1 alpha-2 code, e.g. FR".into()))
}

/// Validator for Instagram handles: blank, or an optional `@` then 1–30 letters, digits, `.` or `_`.
pub fn instagram_handle(value: &str) -> Result<(), ValidationError> {
    let handle = value.trim();
    let handle = handle.strip_prefix('@').unwrap_or(handle);
    let valid_char = |c: char| c.is_ascii_alphanumeric() || c == '.' || c == '_';
    if value.trim().is_empty()
        || (handle.len() <= 30 && !handle.is_empty() && handle.chars().all(valid_char))
    {
        return Ok(());
    }
    Err(ValidationError::new("instagram_handle")
        .with_message("must be an Instagram handle, e.g. @lil_g".into()))
}
