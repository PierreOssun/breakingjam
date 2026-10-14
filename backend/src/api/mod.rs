//! HTTP API under `/api`, one module per resource.

mod auth;
mod events;
mod health;
mod json;
mod page;

use axum::Router;

use crate::state::AppState;

/// All `/api` routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(auth::router())
        .merge(events::router())
}
