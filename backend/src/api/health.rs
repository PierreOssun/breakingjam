//! Health endpoint: the process is up and the database answers.

use axum::{Json, Router, extract::State, routing::get};
use serde::Serialize;

use crate::{error::AppError, state::AppState};

/// Body of `GET /api/health`.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    /// Always `"ok"`; any failure returns the error envelope instead.
    pub status: &'static str,
    /// Crate version of the running binary.
    pub version: &'static str,
}

/// `GET /health`.
pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health))
}

async fn health(State(state): State<AppState>) -> Result<Json<HealthResponse>, AppError> {
    sqlx::query!("select 1 as one")
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    }))
}
