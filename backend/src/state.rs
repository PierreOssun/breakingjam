//! Shared state handed to every handler.

use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Config;

/// Cloned per request; both fields are cheap handles.
#[derive(Clone)]
pub struct AppState {
    /// Postgres connection pool.
    pub pool: PgPool,
    /// Startup configuration.
    pub config: Arc<Config>,
}
