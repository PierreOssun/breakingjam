//! Builds the app for integration tests and sends requests to it.
#![allow(
    dead_code,
    reason = "shared by several test crates, each using a subset"
)]

use axum::{
    Router,
    body::Body,
    http::{HeaderMap, Request, StatusCode, header, request::Builder},
};
use breakingjam::{config::Config, state::AppState};
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

pub fn app(pool: PgPool) -> Router {
    let config = Config::from_lookup(|name| match name {
        "APP_PORT" => None,
        "FRONTEND_ORIGIN" => Some("http://localhost:5173".into()),
        "GOOGLE_REDIRECT_URL" => Some("http://localhost:8080/api/auth/google/callback".into()),
        _ => Some(format!("test-{name}")),
    })
    .unwrap();
    breakingjam::app(AppState::new(pool, config).unwrap()).unwrap()
}

pub struct TestResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub json: Value,
    /// The raw body, for non-JSON responses (SVG, PNG).
    pub bytes: Vec<u8>,
}

impl TestResponse {
    /// `name=value` of a cookie the response sets, ready for a `Cookie` header.
    pub fn cookie(&self, name: &str) -> Option<String> {
        self.headers
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .find(|value| value.starts_with(&format!("{name}=")))
            .map(|value| value.split(';').next().unwrap().to_owned())
    }
}

/// The `id` of a created or fetched resource.
pub fn id_of(response: &TestResponse) -> String {
    response.json["id"].as_str().unwrap().to_owned()
}

pub async fn send(app: &Router, request: Request<Body>) -> TestResponse {
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&body).unwrap_or(Value::Null);
    TestResponse {
        status,
        headers,
        json,
        bytes: body.to_vec(),
    }
}

pub fn get(uri: &str, cookie: Option<&str>) -> Request<Body> {
    request("GET", uri, cookie).body(Body::empty()).unwrap()
}

pub fn post(uri: &str, body: Value, cookie: Option<&str>) -> Request<Body> {
    request("POST", uri, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub fn put(uri: &str, body: Value, cookie: Option<&str>) -> Request<Body> {
    request("PUT", uri, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub fn delete(uri: &str, cookie: Option<&str>) -> Request<Body> {
    request("DELETE", uri, cookie).body(Body::empty()).unwrap()
}

/// Registers `email` and returns its session cookie, ready for a `Cookie` header.
pub async fn sign_up(app: &Router, email: &str) -> String {
    let body =
        serde_json::json!({ "email": email, "password": "correct horse", "display_name": "Test" });
    send(app, post("/api/auth/register", body, None))
        .await
        .cookie("bj_session")
        .unwrap()
}

/// Makes `owner`'s jam public: submitted through the API, then approved in the DB (the review
/// itself is tested in `tests/reviews.rs`).
pub async fn publish(app: &Router, pool: &PgPool, jam: &str, owner: &str) {
    let uri = format!("/api/events/{jam}/submit");
    let submitted = send(app, post(&uri, Value::Null, Some(owner))).await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.json);
    sqlx::query!(
        "update events set status = 'published' where id = $1::text::uuid",
        jam
    )
    .execute(pool)
    .await
    .unwrap();
}

/// Sets a role directly in the DB (`user`, `organizer`, `seed_admin`, `admin`).
pub async fn set_role(pool: &PgPool, email: &str, role: &str) {
    sqlx::query!(
        "update app_users set role = $2::text::user_role where email = $1::text::citext",
        email,
        role,
    )
    .execute(pool)
    .await
    .unwrap();
}

fn request(method: &str, uri: &str, cookie: Option<&str>) -> Builder {
    let request = Request::builder().method(method).uri(uri);
    match cookie {
        Some(cookie) => request.header(header::COOKIE, cookie),
        None => request,
    }
}
