//! Liveness endpoint.

use axum::{Json, Router, routing::get};
use serde::Serialize;

/// Body of `GET /api/health`.
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    /// Always `"ok"` while the process serves requests.
    pub status: &'static str,
    /// Crate version of the running binary.
    pub version: &'static str,
}

/// `GET /health`.
pub fn router() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}
