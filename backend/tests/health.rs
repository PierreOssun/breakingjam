mod test_app;

use axum::http::StatusCode;
use sqlx::PgPool;
use test_app::{app, get, send};

#[sqlx::test]
async fn health_returns_ok(pool: PgPool) {
    let response = send(&app(pool), get("/api/health", None)).await;

    assert_eq!(response.status, StatusCode::OK);
    assert!(response.headers.contains_key("x-request-id"));
    assert_eq!(response.json["status"], "ok");
}

#[sqlx::test]
async fn health_reports_database_down(pool: PgPool) {
    let app = app(pool.clone());
    pool.close().await;

    let response = send(&app, get("/api/health", None)).await;

    assert_eq!(response.status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(response.json["error"]["code"], "internal");
}

#[tokio::test]
async fn unknown_route_is_404() {
    // Routing never touches the pool, so a lazy one spares a throwaway test database.
    let pool = PgPool::connect_lazy("postgres://unused").unwrap();
    let response = send(&app(pool), get("/api/nope", None)).await;
    assert_eq!(response.status, StatusCode::NOT_FOUND);
}
