//! Who may call what, across every route: the sweeps read `openapi.json`, so a route is
//! covered as soon as it is documented (M13 coverage pass).
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{
    TestResponse, app, delete, get, id_of, post, publish, put, send, set_role, sign_up,
};
use uuid::Uuid;

const SPEC: &str = include_str!("../openapi.json");

/// Every documented operation as `(method, path template, operation)`.
fn operations() -> Vec<(String, String, Value)> {
    let spec: Value = serde_json::from_str(SPEC).unwrap();
    let paths = spec["paths"].as_object().unwrap();
    paths
        .iter()
        .flat_map(|(path, ops)| {
            ops.as_object()
                .unwrap()
                .iter()
                .map(move |(method, op)| (method.clone(), path.clone(), op.clone()))
        })
        .collect()
}

/// A concrete URI for a template: ids are fresh (so unknown) UUIDs, a transition is `publish`.
fn concrete(template: &str) -> String {
    template
        .split('/')
        .map(|segment| match segment {
            "{transition}" => "publish".to_owned(),
            s if s.starts_with('{') => Uuid::now_v7().to_string(),
            s => s.to_owned(),
        })
        .collect::<Vec<_>>()
        .join("/")
}

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    body: Value,
    cookie: Option<&str>,
) -> TestResponse {
    let request = match method {
        "get" => get(uri, cookie),
        "delete" => delete(uri, cookie),
        "post" => post(uri, body, cookie),
        "put" => put(uri, body, cookie),
        other => panic!("no test request for {other}"),
    };
    send(app, request).await
}

fn jam() -> Value {
    json!({ "name": "Jam", "starts_on": "2030-06-01", "ends_on": "2030-06-01",
            "timezone": "Europe/Paris", "city": "Paris", "country": "FR" })
}

fn battle() -> Value {
    json!({ "format": "team", "team_size": 1, "gender": "mixed", "age": "adult", "age_min": 18 })
}

/// A body that passes validation for each operation that takes one, so the sweeps reach
/// the handler instead of stopping at 422.
fn valid_body(method: &str, path: &str) -> Value {
    let id = || Uuid::now_v7().to_string();
    match (method, path) {
        ("put", "/api/events/{id}") => jam(),
        ("post", "/api/events/{id}/battles") | ("put", "/api/battles/{id}") => battle(),
        ("put", "/api/events/{id}/battles/order") | ("put", "/api/events/{id}/staff") => json!([]),
        ("post", "/api/battles/{id}/entries") | ("put", "/api/entries/{id}") => {
            json!({ "dancer_ids": [id()] })
        }
        ("put", "/api/dancers/{id}") => json!({ "dancer_name": "Lil G", "country": "FR" }),
        ("put", "/api/crews/{id}") => json!({ "name": "Floor Lords" }),
        ("post", "/api/crews/{id}/members") => json!({ "dancer_id": id() }),
        ("post", "/api/admin/dancers/{id}/merge") => json!({ "into": id() }),
        ("post", "/api/admin/events/{id}/reject") => json!({ "note": "Add the venue" }),
        ("put", "/api/admin/users/{id}/role") => json!({ "role": "user" }),
        ("put", "/api/organizers/{id}") => json!({ "display_name": "Floor Lords" }),
        _ => json!({}),
    }
}

#[sqlx::test]
async fn every_route_that_needs_a_session_refuses_anonymous_calls(pool: PgPool) {
    let app = app(pool);
    let mut wrong = Vec::new();
    let mut checked = 0;
    for (method, path, op) in operations() {
        if op["security"] != json!([{ "session": [] }]) {
            continue;
        }
        checked += 1;
        // An empty body: the session is checked before the body is read.
        let response = call(&app, &method, &concrete(&path), json!({}), None).await;
        if response.status != StatusCode::UNAUTHORIZED {
            wrong.push(format!("{method} {path}: {}", response.status));
        }
    }
    assert!(wrong.is_empty(), "expected 401: {wrong:#?}");
    assert!(checked >= 30, "only {checked} routes need a session?");
}

#[sqlx::test]
async fn every_route_on_a_missing_resource_answers_404(pool: PgPool) {
    let app = app(pool.clone());
    // An admin passes every role check, so only the missing resource can refuse.
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let mut wrong = Vec::new();
    let mut checked = 0;
    for (method, path, op) in operations() {
        if op["responses"].get("404").is_none() || !path.contains('{') {
            continue;
        }
        checked += 1;
        let body = valid_body(&method, &path);
        let response = call(&app, &method, &concrete(&path), body, Some(&admin)).await;
        if response.status != StatusCode::NOT_FOUND {
            wrong.push(format!(
                "{method} {path}: {} {}",
                response.status, response.json
            ));
        }
    }
    assert!(wrong.is_empty(), "expected 404: {wrong:#?}");
    assert!(checked >= 30, "only {checked} routes take an id?");
}

#[sqlx::test]
async fn every_paged_list_rejects_a_garbled_cursor(pool: PgPool) {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let mut checked = 0;
    for (method, path, op) in operations() {
        let paged = op["parameters"]
            .as_array()
            .is_some_and(|params| params.iter().any(|p| p["name"] == "cursor"));
        if !paged {
            continue;
        }
        let uri = format!("{path}?cursor=not-a-cursor");
        let response = call(&app, &method, &uri, json!({}), Some(&admin)).await;
        assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY, "{path}");
        // The error envelope of §5: `{ error: { code, message, fields? } }`.
        assert_eq!(response.json["error"]["code"], "validation", "{path}");
        assert!(response.json["error"]["message"].is_string(), "{path}");
        checked += 1;
    }
    assert_eq!(
        checked, 6,
        "events, dancers, crews, jams in review and both claim queues are paged"
    );
}

/// Accounts and resources for the 403 matrix: an organiser's published jam with a battle,
/// an entry and a crew, plus people who must not touch them.
struct World {
    app: Router,
    owner: String,
    owner_id: String,
    other_organizer: String,
    plain_user: String,
    other_id: String,
    jam: String,
    battle: String,
    entry: String,
    crew: String,
    dancer: String,
}

async fn world(pool: PgPool) -> World {
    let app = app(pool.clone());
    let owner = sign_up(&app, "owner@example.com").await;
    let owner_id = id_of(&send(&app, get("/api/auth/me", Some(&owner))).await);
    let jam = id_of(&send(&app, post("/api/events", jam(), Some(&owner))).await);
    publish(&app, &pool, &jam, &owner).await;
    let battle_uri = format!("/api/events/{jam}/battles");
    let battle = id_of(&send(&app, post(&battle_uri, battle(), Some(&owner))).await);
    let dancer_body = json!({ "dancer_name": "Lil G", "country": "FR" });
    let dancer = id_of(&send(&app, post("/api/dancers", dancer_body, Some(&owner))).await);
    let entry_uri = format!("/api/battles/{battle}/entries");
    let entry_body = json!({ "dancer_ids": [dancer] });
    let entry = id_of(&send(&app, post(&entry_uri, entry_body, Some(&owner))).await);
    let crew_body = json!({ "name": "Floor Lords" });
    let crew = id_of(&send(&app, post("/api/crews", crew_body, Some(&owner))).await);
    let other_organizer = sign_up(&app, "other@example.com").await;
    set_role(&pool, "other@example.com", "organizer").await;
    let other_id = id_of(&send(&app, get("/api/auth/me", Some(&other_organizer))).await);
    let plain_user = sign_up(&app, "user@example.com").await;
    World {
        app,
        owner,
        owner_id,
        other_organizer,
        plain_user,
        other_id,
        jam,
        battle,
        entry,
        crew,
        dancer,
    }
}

#[sqlx::test]
async fn writes_on_someone_elses_things_are_forbidden(pool: PgPool) {
    let w = world(pool).await;
    let (jam_id, battle_id, entry, crew, dancer, owner_id) =
        (&w.jam, &w.battle, &w.entry, &w.crew, &w.dancer, &w.owner_id);
    let entry_body = json!({ "dancer_ids": [dancer] });
    // (method, uri, body, who): the jam's writers are its owner and seed_admin+ (§5 Auth).
    let cases: Vec<(&str, String, Value, &str)> = vec![
        (
            "put",
            format!("/api/events/{jam_id}"),
            jam(),
            &w.other_organizer,
        ),
        (
            "delete",
            format!("/api/events/{jam_id}"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "post",
            format!("/api/events/{jam_id}/cancel"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "post",
            format!("/api/events/{jam_id}/battles"),
            battle(),
            &w.other_organizer,
        ),
        (
            "put",
            format!("/api/events/{jam_id}/battles/order"),
            json!([battle_id]),
            &w.other_organizer,
        ),
        (
            "put",
            format!("/api/events/{jam_id}/staff"),
            json!([]),
            &w.other_organizer,
        ),
        // The writer check comes before the upload is read, so no images are needed here.
        (
            "post",
            format!("/api/events/{jam_id}/flyer"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "delete",
            format!("/api/events/{jam_id}/flyer"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "put",
            format!("/api/battles/{battle_id}"),
            battle(),
            &w.other_organizer,
        ),
        (
            "delete",
            format!("/api/battles/{battle_id}"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "post",
            format!("/api/battles/{battle_id}/entries"),
            entry_body.clone(),
            &w.other_organizer,
        ),
        (
            "put",
            format!("/api/entries/{entry}"),
            entry_body,
            &w.other_organizer,
        ),
        (
            "delete",
            format!("/api/entries/{entry}"),
            json!({}),
            &w.other_organizer,
        ),
        // Crews are written by organisers and up.
        (
            "post",
            "/api/crews".into(),
            json!({ "name": "Crew" }),
            &w.plain_user,
        ),
        (
            "put",
            format!("/api/crews/{crew}"),
            json!({ "name": "Crew" }),
            &w.plain_user,
        ),
        (
            "delete",
            format!("/api/crews/{crew}"),
            json!({}),
            &w.plain_user,
        ),
        (
            "post",
            format!("/api/crews/{crew}/members"),
            json!({ "dancer_id": dancer }),
            &w.plain_user,
        ),
        (
            "delete",
            format!("/api/crews/{crew}/members/{dancer}"),
            json!({}),
            &w.plain_user,
        ),
        // Dancers: deleting is seed_admin+; an unverified dancer is edited by its creator only.
        (
            "delete",
            format!("/api/dancers/{dancer}"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "put",
            format!("/api/dancers/{dancer}"),
            json!({ "dancer_name": "X", "country": "FR" }),
            &w.plain_user,
        ),
        // An organiser page is its owner's.
        (
            "put",
            format!("/api/organizers/{owner_id}"),
            json!({ "display_name": "X" }),
            &w.other_organizer,
        ),
        (
            "get",
            format!("/api/organizers/{owner_id}/claim"),
            json!({}),
            &w.other_organizer,
        ),
        (
            "post",
            format!("/api/organizers/{owner_id}/claim"),
            json!({}),
            &w.other_organizer,
        ),
    ];
    let mut wrong = Vec::new();
    for (method, uri, body, who) in cases {
        let response = call(&w.app, method, &uri, body, Some(who)).await;
        if response.status != StatusCode::FORBIDDEN {
            wrong.push(format!("{method} {uri}: {}", response.status));
        }
    }
    assert!(wrong.is_empty(), "expected 403: {wrong:#?}");
}

#[sqlx::test]
async fn admin_routes_are_for_admins_only(pool: PgPool) {
    let w = world(pool).await;
    let id = Uuid::now_v7();
    let cases: Vec<(&str, String, Value)> = vec![
        ("get", "/api/admin/claims".into(), json!({})),
        ("post", format!("/api/admin/claims/{id}/approve"), json!({})),
        ("post", format!("/api/admin/claims/{id}/reject"), json!({})),
        ("get", "/api/admin/organizer-claims".into(), json!({})),
        (
            "post",
            format!("/api/admin/organizer-claims/{id}/approve"),
            json!({}),
        ),
        (
            "post",
            format!("/api/admin/organizer-claims/{id}/reject"),
            json!({}),
        ),
        (
            "post",
            format!("/api/admin/dancers/{}/merge", w.dancer),
            json!({ "into": id }),
        ),
        (
            "put",
            format!("/api/admin/users/{}/role", w.other_id),
            json!({ "role": "admin" }),
        ),
    ];
    let mut wrong = Vec::new();
    for (method, uri, body) in cases {
        // An organiser who owns jams is still not an admin.
        let response = call(&w.app, method, &uri, body, Some(&w.owner)).await;
        if response.status != StatusCode::FORBIDDEN {
            wrong.push(format!("{method} {uri}: {}", response.status));
        }
    }
    assert!(wrong.is_empty(), "expected 403: {wrong:#?}");
}

#[sqlx::test]
async fn invalid_fields_come_back_named(pool: PgPool) {
    let w = world(pool).await;
    let mut kids = battle();
    kids["age"] = json!("kids");
    kids["age_max"] = json!(18);
    let mut bad_jam = jam();
    bad_jam["timezone"] = json!("Paris");
    // (method, uri, body, the field the API must name): one per resource that takes input.
    let cases: Vec<(&str, String, Value, &str)> = vec![
        ("post", "/api/events".into(), bad_jam, "timezone"),
        ("put", format!("/api/battles/{}", w.battle), kids, "age_max"),
        ("post", "/api/crews".into(), json!({ "name": " " }), "name"),
        (
            "put",
            format!("/api/dancers/{}", w.dancer),
            json!({ "dancer_name": "Lil G", "country": "fr" }),
            "country",
        ),
        (
            "put",
            format!("/api/entries/{}", w.entry),
            json!({ "dancer_ids": [] }),
            "dancer_ids",
        ),
        (
            "put",
            format!("/api/organizers/{}", w.owner_id),
            json!({ "display_name": "X", "instagram_handle": "a b" }),
            "instagram_handle",
        ),
    ];
    for (method, uri, body, field) in cases {
        let response = call(&w.app, method, &uri, body, Some(&w.owner)).await;
        assert_eq!(
            response.status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{method} {uri}"
        );
        assert_eq!(
            response.json["error"]["code"], "validation",
            "{method} {uri}"
        );
        let fields = response.json["error"]["fields"].as_array().unwrap();
        assert!(
            fields
                .iter()
                .any(|f| f["field"] == field && f["message"].is_string()),
            "{method} {uri}: {fields:?}"
        );
    }
}
