use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use breakingjam::{config::Config, state::AppState};
use http_body_util::BodyExt;
use sqlx::PgPool;
use tower::ServiceExt;

fn app(pool: PgPool) -> Router {
    let config =
        Config::from_lookup(|name| (name != "APP_PORT").then(|| format!("test-{name}"))).unwrap();
    breakingjam::app(AppState {
        pool,
        config: Arc::new(config),
    })
}

fn get(uri: &str) -> Request<Body> {
    Request::builder().uri(uri).body(Body::empty()).unwrap()
}

#[sqlx::test]
async fn health_returns_ok(pool: PgPool) {
    let response = app(pool).oneshot(get("/api/health")).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().contains_key("x-request-id"));

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
}

#[sqlx::test]
async fn health_reports_database_down(pool: PgPool) {
    let app = app(pool.clone());
    pool.close().await;

    let response = app.oneshot(get("/api/health")).await.unwrap();

    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["error"]["code"], "internal");
}

#[tokio::test]
async fn unknown_route_is_404() {
    // Routing never touches the pool, so a lazy one spares a throwaway test database.
    let pool = PgPool::connect_lazy("postgres://unused").unwrap();
    let response = app(pool).oneshot(get("/api/nope")).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
