//! Unit tests of `crate::auth::google`.

use axum::http::{HeaderMap, HeaderValue, header};

use crate::{auth::google::*, config::Config};

fn config() -> Config {
    Config::from_lookup(|name| match name {
        "APP_PORT" => None,
        "GOOGLE_REDIRECT_URL" => Some("http://localhost:8080/api/auth/google/callback".into()),
        _ => Some(format!("test-{name}")),
    })
    .unwrap()
}

#[test]
fn authorize_round_trips_through_the_cookie() {
    let (url, cookie) = authorize(&config(), "/org/jams/new?step=2").unwrap();
    assert!(url.starts_with(AUTH_URL));
    assert!(url.contains("code_challenge_method=S256"));

    let set_cookie = cookie.to_str().unwrap();
    let value = set_cookie.split(';').next().unwrap();
    let mut headers = HeaderMap::new();
    headers.insert(header::COOKIE, HeaderValue::from_str(value).unwrap());

    let pending = pending(&headers).unwrap();
    assert_eq!(pending.next, "/org/jams/new?step=2");
    assert!(url.contains(&format!("state={}", pending.state)));
}
