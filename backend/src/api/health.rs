//! Health endpoint: the process is up and the database answers.

use axum::{Json, extract::State};
use serde::Serialize;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    error::{AppError, ErrorEnvelope},
    state::AppState,
};

/// Body of `GET /api/health`.
#[derive(Debug, Serialize, ToSchema)]
pub struct HealthResponse {
    /// Always `"ok"`; any failure returns the error envelope instead.
    pub status: &'static str,
    /// Crate version of the running binary.
    pub version: &'static str,
}

/// `GET /health`.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(health))
}

/// The process is up and the database answers.
#[utoipa::path(
    get,
    path = "/health",
    tag = "health",
    operation_id = "health",
    responses(
        (status = OK, body = HealthResponse),
        (status = INTERNAL_SERVER_ERROR, description = "Database unreachable", body = ErrorEnvelope),
    )
)]
async fn health(State(state): State<AppState>) -> Result<Json<HealthResponse>, AppError> {
    sqlx::query!("select 1 as one")
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    }))
}
