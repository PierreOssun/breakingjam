//! HTTP API under `/api`, one module per resource.

mod admin;
pub(crate) mod auth;
mod battles;
mod claims;
mod codes;
mod crews;
mod dancers;
mod events;
mod extract;
mod flyers;
pub(crate) mod geo;
mod health;
mod organizers;
pub(crate) mod page;
mod places;
mod reviews;
mod stats;
mod transaction;

use utoipa_axum::router::OpenApiRouter;

use crate::state::AppState;

/// All `/api` routes, documented by their `#[utoipa::path]` attributes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .merge(health::router())
        .merge(auth::router())
        .merge(codes::router())
        .merge(events::router())
        .merge(flyers::router())
        .merge(geo::router())
        .merge(dancers::router())
        .merge(crews::router())
        .merge(battles::router())
        .merge(claims::router())
        .merge(admin::router())
        .merge(reviews::router())
        .merge(stats::router())
        .merge(organizers::router())
        .merge(places::router())
}
