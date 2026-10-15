//! Process configuration read from the environment.

use thiserror::Error;

const DEFAULT_PORT: u16 = 8080;

/// Everything the server needs from the environment; built once at startup.
#[derive(Debug, Clone)]
pub struct Config {
    /// Postgres connection string.
    pub database_url: String,
    /// TCP port the API listens on.
    pub app_port: u16,
    /// Public base URL of the API, used to build absolute links.
    pub app_base_url: String,
    /// Origin of the frontend, for CORS.
    pub frontend_origin: String,
    /// Google OAuth client id.
    pub google_client_id: String,
    /// Google OAuth client secret.
    pub google_client_secret: String,
    /// Google OAuth redirect URL, must match the Google console.
    pub google_redirect_url: String,
}

/// Why the configuration could not be built.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// Required variables that are unset or empty.
    #[error("missing environment variables: {}", .0.join(", "))]
    Missing(Vec<&'static str>),
    /// A variable is set but cannot be parsed.
    #[error("invalid value for {0}")]
    Invalid(&'static str),
}

impl Config {
    /// Cookies get `Secure` when the API is served over https (always in prod).
    pub fn secure_cookies(&self) -> bool {
        self.app_base_url.starts_with("https://")
    }

    /// Reads the process environment; reports every missing variable at once.
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// Same as `from_env` with an injectable source, so tests need no global env.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        // An empty variable (`APP_PORT=` in `.env`) counts as unset.
        let get = |name: &str| lookup(name).filter(|v| !v.is_empty());

        let app_port = match get("APP_PORT") {
            Some(port) => port.parse().map_err(|_| ConfigError::Invalid("APP_PORT"))?,
            None => DEFAULT_PORT,
        };

        let mut missing = Vec::new();
        let mut required = |name: &'static str| {
            let value = get(name);
            if value.is_none() {
                missing.push(name);
            }
            value.unwrap_or_default()
        };
        let config = Self {
            database_url: required("DATABASE_URL"),
            app_port,
            app_base_url: required("APP_BASE_URL"),
            frontend_origin: required("FRONTEND_ORIGIN"),
            google_client_id: required("GOOGLE_CLIENT_ID"),
            google_client_secret: required("GOOGLE_CLIENT_SECRET"),
            google_redirect_url: required("GOOGLE_REDIRECT_URL"),
        };

        if missing.is_empty() {
            Ok(config)
        } else {
            Err(ConfigError::Missing(missing))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn full_env() -> HashMap<&'static str, String> {
        [
            "DATABASE_URL",
            "APP_BASE_URL",
            "FRONTEND_ORIGIN",
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REDIRECT_URL",
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
}
