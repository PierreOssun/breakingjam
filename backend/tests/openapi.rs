//! `backend/openapi.json` must match the routes: CI generates the frontend's TS types from it.
mod test_app;

use axum::http::StatusCode;
use sqlx::PgPool;
use test_app::{app, get, send};

const PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/openapi.json");

#[test]
fn openapi_json_is_up_to_date() {
    let current = breakingjam::openapi().to_pretty_json().unwrap() + "\n";
    if std::env::var_os("UPDATE_OPENAPI").is_some() {
        std::fs::write(PATH, &current).unwrap();
        return;
    }
    let committed = std::fs::read_to_string(PATH).unwrap_or_default();
    // A plain `assert!`: `assert_eq!` would print two copies of a 100 KB document.
    assert!(
        committed == current,
        "backend/openapi.json is stale; run `UPDATE_OPENAPI=1 cargo test --test openapi` and commit it"
    );
}

#[test]
fn every_ref_resolves() {
    // utoipa does not register schemas reached only through query params, which leaves
    // dangling `$ref`s that break the TS generator.
    fn refs(value: &serde_json::Value, out: &mut Vec<String>) {
        match value {
            serde_json::Value::Object(map) => {
                if let Some(serde_json::Value::String(r)) = map.get("$ref") {
                    out.push(r.clone());
                }
                map.values().for_each(|v| refs(v, out));
            }
            serde_json::Value::Array(items) => items.iter().for_each(|v| refs(v, out)),
            _ => {}
        }
    }
    let spec = serde_json::to_value(breakingjam::openapi()).unwrap();
    let mut found = Vec::new();
    refs(&spec, &mut found);
    let dangling: Vec<&String> = found
        .iter()
        .filter(|r| {
            let name = r.trim_start_matches("#/components/schemas/");
            spec["components"]["schemas"].get(name).is_none()
        })
        .collect();
    assert!(dangling.is_empty(), "dangling $refs: {dangling:?}");
}

#[tokio::test]
async fn spec_and_swagger_ui_are_served() {
    // Neither route touches the pool, so a lazy one spares a throwaway test database.
    let app = app(PgPool::connect_lazy("postgres://unused").unwrap());

    let spec = send(&app, get("/api/openapi.json", None)).await;
    assert_eq!(spec.status, StatusCode::OK);
    assert_eq!(spec.json["openapi"], "3.1.0");
    assert!(spec.json["paths"]["/api/events"]["get"].is_object());

    // Swagger UI is mounted in debug builds only.
    let docs = send(&app, get("/api/docs/", None)).await;
    let expected = if cfg!(debug_assertions) {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    };
    assert_eq!(docs.status, expected);
}
