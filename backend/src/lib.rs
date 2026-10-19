//! Application router, HTTP middleware and tracing setup shared by both binaries.

pub mod api;
pub mod auth;
pub mod config;
pub mod dataset;
pub mod db;
pub mod domain;
pub mod error;
pub mod flyer;
pub mod openapi;
pub mod state;

#[cfg(test)]
#[path = "../tests/unit/mod.rs"]
mod unit_tests;

use axum::{Json, Router, http::Request, routing::get};
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    trace::{DefaultOnResponse, TraceLayer},
};
use tracing::Level;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::state::AppState;

/// Installs the global subscriber: `RUST_LOG` filter, pretty in dev, JSON when `LOG_FORMAT=json`.
pub fn init_tracing() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("breakingjam=debug,seed=info,tower_http=info"));
    let json = std::env::var("LOG_FORMAT").as_deref() == Ok("json");
    tracing_subscriber::registry()
        .with(filter)
        .with(json.then(|| tracing_subscriber::fmt::layer().json()))
        .with((!json).then(|| tracing_subscriber::fmt::layer().pretty()))
        .init();
}

/// The OpenAPI document of the API, as served at `/api/openapi.json`.
pub fn openapi() -> utoipa::openapi::OpenApi {
    openapi::router().into_openapi()
}

/// Builds the full application router.
pub fn app(state: AppState) -> Router {
    let (router, spec) = openapi::router().split_for_parts();
    let router = router.route(
        "/api/openapi.json",
        get(move || std::future::ready(Json(spec.clone()))),
    );
    // Swagger UI is a dev tool (§5 Routes); release builds only serve the JSON.
    #[cfg(debug_assertions)]
    let router = router.merge(
        utoipa_swagger_ui::SwaggerUi::new("/api/docs")
            .config(utoipa_swagger_ui::Config::new(["/api/openapi.json"])),
    );
    router
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|req: &Request<_>| {
                    // Set by `SetRequestIdLayer` below, which wraps this layer and so runs first.
                    let request_id = req
                        .extensions()
                        .get::<RequestId>()
                        .and_then(|id| id.header_value().to_str().ok())
                        .unwrap_or_default();
                    tracing::info_span!(
                        "request",
                        method = %req.method(),
                        // Path only: query strings can carry OAuth codes and other secrets.
                        path = %req.uri().path(),
                        request_id,
                    )
                })
                // One line per request (status, latency) at the default `tower_http=info` filter.
                .on_response(DefaultOnResponse::new().level(Level::INFO))
                // `AppError` already logs the cause of every 5xx; the default hook would log it twice.
                .on_failure(()),
        )
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .with_state(state)
}
