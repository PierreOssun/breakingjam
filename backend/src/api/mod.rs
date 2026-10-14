//! HTTP API under `/api`, one module per resource.

mod admin;
mod auth;
mod battles;
mod claims;
mod crews;
mod dancers;
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
        .merge(dancers::router())
        .merge(crews::router())
        .merge(battles::router())
        .merge(claims::router())
        .merge(admin::router())
}
