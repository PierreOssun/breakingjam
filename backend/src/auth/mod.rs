//! Authentication: password hashing, session cookies and Google sign-in.

pub mod google;
pub mod password;
pub mod session;

use axum::http::{HeaderMap, HeaderValue, header};

use crate::error::AppError;

/// Value of the `name` cookie sent by the browser.
fn read_cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find_map(|(key, value)| (key == name).then_some(value))
}

/// A `Set-Cookie` value; `max_age = 0` deletes the cookie.
fn cookie(name: &str, value: &str, max_age: u32, secure: bool) -> Result<HeaderValue, AppError> {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::try_from(format!(
        "{name}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}"
    ))
    .map_err(|err| AppError::Internal(err.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_cookie_among_others() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("a=1; bj_session=abc; b=2"),
        );
        assert_eq!(read_cookie(&headers, "bj_session"), Some("abc"));
        assert_eq!(read_cookie(&headers, "missing"), None);
    }

    #[test]
    fn cookie_is_secure_only_when_asked() {
        let plain = cookie("bj_session", "abc", 60, false).unwrap();
        assert_eq!(
            plain,
            "bj_session=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Lax"
        );
        let secure = cookie("bj_session", "abc", 60, true).unwrap();
        assert!(secure.to_str().unwrap().ends_with("; Secure"));
    }
}
