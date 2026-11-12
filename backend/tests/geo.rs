//! `GET /api/geo`: the country Cloudflare saw the visitor in, or null.
mod test_app;

use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{app, send};

async fn geo(pool: PgPool, header: Option<&str>) -> Value {
    let mut request = Request::builder().uri("/api/geo");
    if let Some(country) = header {
        request = request.header("cf-ipcountry", country);
    }
    let response = send(&app(pool), request.body(Default::default()).unwrap()).await;
    assert_eq!(response.status, StatusCode::OK);
    response.json
}

#[sqlx::test]
async fn names_the_visitors_country(pool: PgPool) {
    assert_eq!(geo(pool, Some("CH")).await, json!({ "country": "CH" }));
}

#[sqlx::test]
async fn is_null_when_unknown(pool: PgPool) {
    assert_eq!(geo(pool.clone(), None).await, json!({ "country": null }));
    assert_eq!(geo(pool, Some("XX")).await, json!({ "country": null }));
}
