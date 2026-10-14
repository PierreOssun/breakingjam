//! Application router: API routes plus HTTP middleware.

pub mod api;

use axum::{Router, http::Request};
use tower_http::{
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    trace::TraceLayer,
};

/// Builds the full application router.
pub fn app() -> Router {
    Router::new()
        .nest("/api", api::router())
        .layer(
            TraceLayer::new_for_http().make_span_with(|req: &Request<_>| {
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
            }),
        )
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
}
