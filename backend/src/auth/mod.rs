//! Authentication: password hashing, session cookies and Google sign-in.

pub mod google;
pub mod password;
pub mod session;

use axum::http::{HeaderMap, HeaderValue, header};

use crate::error::AppError;

/// Value of the `name` cookie sent by the browser.
pub(crate) fn read_cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find_map(|(key, value)| (key == name).then_some(value))
}

/// A `Set-Cookie` value; `max_age = 0` deletes the cookie.
pub(crate) fn cookie(
    name: &str,
    value: &str,
    max_age: u32,
    secure: bool,
) -> Result<HeaderValue, AppError> {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::try_from(format!(
        "{name}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"
    ))
    .map_err(|err| AppError::Internal(err.into()))
}
