//! HTTP API under `/api`, one module per resource.

mod auth;
mod health;
mod json;

use axum::Router;

use crate::state::AppState;

/// All `/api` routes.
pub fn router() -> Router<AppState> {
    Router::new().merge(health::router()).merge(auth::router())
}
