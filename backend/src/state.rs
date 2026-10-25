//! Shared state handed to every handler.

use std::{sync::Arc, time::Duration};

use oauth2::reqwest;
use sqlx::PgPool;

use crate::{config::Config, media::MediaStore};

/// Cloned per request; every field is a cheap handle.
#[derive(Clone)]
pub struct AppState {
    /// Postgres connection pool.
    pub pool: PgPool,
    /// Startup configuration.
    pub config: Arc<Config>,
    /// Outbound HTTP (Google OAuth, the media store); never follows redirects.
    pub http: reqwest::Client,
    /// Where uploaded images go.
    pub media: MediaStore,
}

impl AppState {
    /// Builds the state, including the outbound HTTP client and the media store using it.
    pub fn new(pool: PgPool, config: Config) -> reqwest::Result<Self> {
        // Following redirects during the token exchange would open an SSRF hole, and a
        // stalled Google endpoint or media store must not pin a request task forever.
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .build()?;
        Ok(Self {
            pool,
            media: MediaStore::new(http.clone(), &config),
            config: Arc::new(config),
            http,
        })
    }
}
