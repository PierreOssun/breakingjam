//! Builds the app for integration tests and sends requests to it.
#![allow(
    dead_code,
    reason = "shared by several test crates, each using a subset"
)]

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use axum::{
    Router,
    body::{Body, Bytes},
    extract::Path,
    http::{HeaderMap, Request, StatusCode, header, request::Builder},
    routing,
};
use breakingjam::{config::Config, state::AppState};
use http_body_util::BodyExt;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

/// Where the test app says uploaded images are served from.
pub const MEDIA_URL: &str = "https://media.example.com";

/// Where nothing listens: tests that upload or read emails use `app_with_media` or `app_with_mail`.
const NOWHERE: &str = "http://127.0.0.1:9";

pub fn app(pool: PgPool) -> Router {
    app_using(pool, NOWHERE, NOWHERE)
}

fn app_using(pool: PgPool, media_store_url: &str, mail_url: &str) -> Router {
    let config = Config::from_lookup(|name| match name {
        "APP_PORT" => None,
        "FRONTEND_ORIGIN" => Some("http://localhost:5173".into()),
        "GOOGLE_REDIRECT_URL" => Some("http://localhost:8080/api/auth/google/callback".into()),
        "MEDIA_STORE_URL" => Some(media_store_url.into()),
        "MEDIA_PUBLIC_URL" => Some(MEDIA_URL.into()),
        "MAIL_URL" => Some(mail_url.into()),
        _ => Some(format!("test-{name}")),
    })
    .unwrap();
    breakingjam::app(AppState::new(pool, config).unwrap()).unwrap()
}

/// Serves `router` on a free local port; returns its base URL.
async fn serve(router: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    url
}

/// What the stand-in store holds: each key's request headers and body.
pub type Objects = Arc<Mutex<BTreeMap<String, (HeaderMap, Bytes)>>>;

/// The app, with a stand-in for the Worker's R2 handler on a local port.
pub async fn app_with_media(pool: PgPool) -> (Router, Objects) {
    let objects = Objects::default();
    let (stored, deleted) = (objects.clone(), objects.clone());
    let store = Router::new().route(
        "/{*key}",
        routing::put(
            |Path(key): Path<String>, headers: HeaderMap, body: Bytes| async move {
                stored.lock().unwrap().insert(key, (headers, body));
            },
        )
        .delete(|Path(key): Path<String>| async move {
            deleted.lock().unwrap().remove(&key);
        }),
    );
    (app_using(pool, &serve(store).await, NOWHERE), objects)
}

/// What the stand-in mail service received: each email's JSON, oldest first.
pub type Mails = Arc<Mutex<Vec<Value>>>;

/// The app, with a stand-in for the Worker's mail handler on a local port.
pub async fn app_with_mail(pool: PgPool) -> (Router, Mails) {
    let mails = Mails::default();
    let received = mails.clone();
    let service = Router::new().route(
        "/",
        routing::post(|axum::Json(mail): axum::Json<Value>| async move {
            received.lock().unwrap().push(mail);
        }),
    );
    let url = serve(service).await;
    (app_using(pool, NOWHERE, &url), mails)
}

/// The first email `wanted`, waiting up to two seconds: the API sends in the background.
pub async fn mail_with(mails: &Mails, wanted: impl Fn(&Value) -> bool) -> Value {
    for _ in 0..200 {
        let found = mails.lock().unwrap().iter().find(|m| wanted(m)).cloned();
        if let Some(mail) = found {
            return mail;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    panic!("no such email in {:?}", mails.lock().unwrap());
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

/// The password `sign_up` gives every account.
pub const PASSWORD: &str = "correct horse";

/// Registers `email`, confirms it with the mailed code and returns its session cookie, ready
/// for a `Cookie` header.
pub async fn sign_up(app: &Router, pool: &PgPool, email: &str) -> String {
    let body = serde_json::json!({ "email": email, "password": PASSWORD, "display_name": "Test" });
    let registered = send(app, post("/api/auth/register", body, None)).await;
    assert_eq!(registered.status, StatusCode::ACCEPTED);
    let code = live_code(pool, email, "verify_email").await.unwrap();
    let body = serde_json::json!({ "email": email, "code": code });
    send(app, post("/api/auth/email/verify", body, None))
        .await
        .cookie("bj_session")
        .unwrap()
}

/// The live code of `email` for `purpose` (`verify_email`, `reset_password`), as stored.
pub async fn live_code(pool: &PgPool, email: &str, purpose: &str) -> Option<String> {
    sqlx::query_scalar!(
        "select c.code from email_codes c join app_users u on u.id = c.user_id
         where u.email = $1::text::citext and c.purpose = $2::text::email_code_purpose",
        email,
        purpose,
    )
    .fetch_optional(pool)
    .await
    .unwrap()
}

/// Makes a jam public in the DB, whatever it lacks; the checklist `submit` runs is tested in
/// `tests/events.rs`, the review in `tests/reviews.rs`.
pub async fn publish(pool: &PgPool, jam: &str) {
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

/// The file parts of a multipart body, as `(name, bytes)`.
pub type Files<'a> = [(&'a str, &'a [u8])];

/// A `multipart/form-data` POST with one file part per `(name, bytes)`.
pub fn post_files(uri: &str, parts: &Files, cookie: Option<&str>) -> Request<Body> {
    const BOUNDARY: &str = "bj-test-boundary";
    let mut body = Vec::new();
    for (name, bytes) in parts {
        body.extend_from_slice(
            format!(
                "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{name}.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{BOUNDARY}--\r\n").as_bytes());
    request("POST", uri, cookie)
        .header(
            header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={BOUNDARY}"),
        )
        .body(Body::from(body))
        .unwrap()
}

/// The start of a JPEG of `width`×`height`: enough for the API's checks, not a viewable image.
pub fn jpeg(width: u16, height: u16) -> Vec<u8> {
    let [w_hi, w_lo] = width.to_be_bytes();
    let [h_hi, h_lo] = height.to_be_bytes();
    let mut bytes = vec![0xFF, 0xD8];
    // An APP0 segment first, as browsers write one, then the baseline frame header.
    bytes.extend_from_slice(&[0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46]);
    bytes.extend_from_slice(&[0xFF, 0xC0, 0x00, 0x0B, 0x08, h_hi, h_lo, w_hi, w_lo, 0x01]);
    bytes.extend_from_slice(&[0x01, 0x11, 0x00, 0xFF, 0xD9]);
    bytes
}

fn request(method: &str, uri: &str, cookie: Option<&str>) -> Builder {
    let request = Request::builder().method(method).uri(uri);
    match cookie {
        Some(cookie) => request.header(header::COOKIE, cookie),
        None => request,
    }
}
