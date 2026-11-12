//! Unit tests of `crate::auth`.

mod google;
mod password;
mod session;

use axum::http::{HeaderMap, HeaderValue, header};

use crate::auth::*;

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
