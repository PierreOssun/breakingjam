//! Public counts for the landing page.

use axum::{Json, extract::State};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    db::{self, stats::SiteStats},
    error::AppError,
    state::AppState,
};

/// `/stats`, public.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(site))
}

/// How far BreakingJam reaches: countries, battles (in total and per country) and dancers.
#[utoipa::path(
    get,
    path = "/stats",
    tag = "stats",
    operation_id = "site_stats",
    responses((status = OK, body = SiteStats))
)]
async fn site(State(state): State<AppState>) -> Result<Json<SiteStats>, AppError> {
    Ok(Json(db::stats::site(&state.pool).await?))
}
