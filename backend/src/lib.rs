//! Application router, HTTP middleware and tracing setup shared by both binaries.

pub mod api;
pub mod auth;
pub mod config;
pub mod db;
pub mod domain;
pub mod error;
pub mod state;

use axum::{Router, http::Request};
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
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

/// Builds the full application router.
pub fn app(state: AppState) -> Router {
    Router::new()
        .nest("/api", api::router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|req: &Request<_>| {
                    let request_id = req
                        .headers()
                        .get("x-request-id")
                        .and_then(|v| v.to_str().ok())
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
