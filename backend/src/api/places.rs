//! `/places`: the city a search names, for "Near <Place>" on the search page.

use axum::{
    Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    db,
    domain::place::{Place, search_key},
    error::AppError,
    state::AppState,
};

/// Below this many letters a prefix names half the world: no lookup.
const MIN_KEY: usize = 3;

/// `/places` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(find))
}

/// Query of `GET /places`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct PlaceQuery {
    /// What was searched, e.g. "Mulhouse".
    pub q: String,
}

/// `GET /places` body.
#[derive(Debug, Serialize, ToSchema)]
pub struct PlaceMatch {
    /// The city the search names; null when none does.
    pub place: Option<Place>,
}

/// The city a search names, case and accents aside: an exact name or alternate name first,
/// else one starting with the search; when several match, one with a public jam nearby, then
/// the most populated.
#[utoipa::path(
    get,
    path = "/places",
    tag = "places",
    operation_id = "find_place",
    params(PlaceQuery),
    responses((status = OK, body = PlaceMatch))
)]
async fn find(
    State(state): State<AppState>,
    Query(query): Query<PlaceQuery>,
) -> Result<Json<PlaceMatch>, AppError> {
    let key = search_key(&query.q);
    let place = if key.chars().count() < MIN_KEY {
        None
    } else {
        db::places::best_match(&state.pool, &key).await?
    };
    Ok(Json(PlaceMatch { place }))
}
