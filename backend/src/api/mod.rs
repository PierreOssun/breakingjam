//! HTTP API under `/api`, one module per resource.

mod health;

use axum::Router;

/// All `/api` routes.
pub fn router() -> Router {
    Router::new().merge(health::router())
}
