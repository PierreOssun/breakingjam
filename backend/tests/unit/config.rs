//! Unit tests of `crate::config`.

use std::collections::HashMap;

use crate::config::*;

fn full_env() -> HashMap<&'static str, String> {
    [
        "DATABASE_URL",
        "APP_BASE_URL",
        "FRONTEND_ORIGIN",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URL",
        "MEDIA_STORE_URL",
        "MEDIA_PUBLIC_URL",
    ]
    .into_iter()
    .map(|name| (name, format!("{name}-value")))
    .collect()
}

fn load(env: &HashMap<&'static str, String>) -> Result<Config, ConfigError> {
    Config::from_lookup(|name| env.get(name).cloned())
}

#[test]
fn port_defaults_to_8080() {
    let config = load(&full_env()).unwrap();
    assert_eq!(config.app_port, 8080);
    assert_eq!(config.database_url, "DATABASE_URL-value");
}

#[test]
fn reports_every_missing_variable() {
    let mut env = full_env();
    env.remove("DATABASE_URL");
    env.insert("GOOGLE_CLIENT_ID", String::new());

    let err = load(&env).unwrap_err();
    assert_eq!(
        err.to_string(),
        "missing environment variables: DATABASE_URL, GOOGLE_CLIENT_ID"
    );
}

#[test]
fn empty_port_uses_default() {
    let mut env = full_env();
    env.insert("APP_PORT", String::new());
    assert_eq!(load(&env).unwrap().app_port, 8080);
}

#[test]
fn rejects_invalid_port() {
    let mut env = full_env();
    env.insert("APP_PORT", "eighty".into());
    assert!(matches!(load(&env), Err(ConfigError::Invalid("APP_PORT"))));
}
