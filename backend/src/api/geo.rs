//! `/geo`: the visitor's country, so the map opens on it.

use axum::{Json, http::HeaderMap};
use serde::Serialize;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{domain::upper_ascii_code, state::AppState};

/// `/geo` route.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(geo))
}

/// Body of `GET /geo`.
#[derive(Debug, Serialize, ToSchema)]
pub struct Geo {
    /// ISO 3166-1 alpha-2 of the visitor's country; null when unknown.
    pub country: Option<String>,
}

/// The visitor's country, from the `cf-ipcountry` header the Worker sets (deploy/src/index.ts).
#[utoipa::path(
    get,
    path = "/geo",
    tag = "geo",
    operation_id = "geo",
    responses((status = OK, body = Geo))
)]
async fn geo(headers: HeaderMap) -> Json<Geo> {
    let country = headers
        .get("cf-ipcountry")
        .and_then(|value| value.to_str().ok())
        .and_then(country_code);
    Json(Geo { country })
}

/// A real country code: Cloudflare sends `XX` when it can't tell and `T1` for Tor.
pub(crate) fn country_code(value: &str) -> Option<String> {
    let real = upper_ascii_code(value, 2) && !matches!(value, "XX" | "T1");
    real.then(|| value.to_owned())
}
