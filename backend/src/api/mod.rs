//! HTTP API under `/api`, one module per resource.

mod admin;
pub(crate) mod auth;
mod battles;
mod claims;
mod crews;
mod dancers;
mod events;
pub(crate) mod geo;
mod health;
mod json;
mod organizers;
pub(crate) mod page;

use utoipa_axum::router::OpenApiRouter;

use crate::state::AppState;

/// All `/api` routes, documented by their `#[utoipa::path]` attributes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .merge(health::router())
        .merge(auth::router())
        .merge(events::router())
        .merge(geo::router())
        .merge(dancers::router())
        .merge(crews::router())
        .merge(battles::router())
        .merge(claims::router())
        .merge(admin::router())
        .merge(organizers::router())
}
