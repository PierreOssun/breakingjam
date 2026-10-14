//! HTTP API under `/api`, one module per resource.

mod health;

use axum::Router;

use crate::state::AppState;

/// All `/api` routes.
pub fn router() -> Router<AppState> {
    Router::new().merge(health::router())
}
