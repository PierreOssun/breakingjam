mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, delete, get, post, publish, put, send, set_role, sign_up};

fn jam(name: &str) -> Value {
    json!({
        "name": name,
        "description": "  ",
        "starts_on": "2030-06-01",
        "ends_on": "2030-06-02",
        "timezone": "Europe/Paris",
        "venue_name": "Le Hangar",
        "address": null,
        "city": "Paris",
        "country": "FR",
        "lat": 48.8566,
        "lng": 2.3522,
        "registration_url": "https://example.com/register",
        "instagram_url": null
    })
}

async fn create(app: &Router, cookie: &str, body: Value) -> TestResponse {
    send(app, post("/api/events", body, Some(cookie))).await
}

/// Creates a draft and returns its id.
async fn draft_id(app: &Router, cookie: &str, body: Value) -> String {
    create(app, cookie, body).await.json["id"]
        .as_str()
        .unwrap()
        .to_owned()
}

async fn act(app: &Router, cookie: &str, id: &str, action: &str) -> TestResponse {
    let uri = format!("/api/events/{id}/{action}");
    send(app, post(&uri, json!({}), Some(cookie))).await
}

async fn make_seed_admin(pool: &PgPool, email: &str) {
    sqlx::query!(
        "update app_users set role = 'seed_admin' where email = $1::text::citext",
        email
    )
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn create_makes_a_draft_and_promotes_the_user(pool: PgPool) {
    let app = app(pool);
    let cookie = sign_up(&app, "org@example.com").await;

    let created = create(&app, &cookie, jam("Paris Cypher Sessions")).await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.json["status"], "draft");
    assert_eq!(
        created.json["description"],
        Value::Null,
        "blank text becomes null"
    );
    let slug = created.json["slug"].as_str().unwrap();
    assert!(slug.starts_with("paris-cypher-sessions-"));

    let me = send(&app, get("/api/auth/me", Some(&cookie))).await;
    assert_eq!(me.json["role"], "organizer");
}

#[sqlx::test]
async fn create_requires_login(pool: PgPool) {
    let response = send(&app(pool), post("/api/events", jam("Jam"), None)).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn create_validates_fields_then_cross_field_rules(pool: PgPool) {
    let app = app(pool);
    let cookie = sign_up(&app, "org@example.com").await;

    let mut bad = jam(" ");
    bad["country"] = json!("fr");
    bad["timezone"] = json!("Paris");
    let response = create(&app, &cookie, bad).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<&str> = response.json["error"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["field"].as_str().unwrap())
        .collect();
    assert_eq!(fields, ["country", "name", "timezone"]);

    let mut inconsistent = jam("Jam");
    inconsistent["ends_on"] = json!("2030-05-31");
    inconsistent["lng"] = Value::Null;
    let response = create(&app, &cookie, inconsistent).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response.json["error"]["fields"][0]["field"], "ends_on");
    assert_eq!(response.json["error"]["fields"][1]["field"], "lat");
}

#[sqlx::test]
async fn drafts_are_visible_to_writers_only(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let created = create(&app, &owner, jam("Secret Jam")).await;
    let id = created.json["id"].as_str().unwrap();
    let slug = created.json["slug"].as_str().unwrap();

    let by_slug = send(&app, get(&format!("/api/events/{slug}"), Some(&owner))).await;
    assert_eq!(by_slug.status, StatusCode::OK);
    assert_eq!(by_slug.json["id"], id);
    assert_eq!(by_slug.json["can_edit"], true);

    let anonymous = send(&app, get(&format!("/api/events/{id}"), None)).await;
    assert_eq!(anonymous.status, StatusCode::NOT_FOUND);
    let stranger = sign_up(&app, "other@example.com").await;
    let other = send(&app, get(&format!("/api/events/{id}"), Some(&stranger))).await;
    assert_eq!(other.status, StatusCode::NOT_FOUND);

    let admin = sign_up(&app, "seed@example.com").await;
    make_seed_admin(&pool, "seed@example.com").await;
    let seen = send(&app, get(&format!("/api/events/{id}"), Some(&admin))).await;
    assert_eq!(seen.status, StatusCode::OK);
    assert_eq!(seen.json["can_edit"], true, "seed_admin writes any jam");

    publish(&app, &pool, id, &owner).await;
    let public = send(&app, get(&format!("/api/events/{slug}"), None)).await;
    assert_eq!(public.status, StatusCode::OK);
    assert_eq!(public.json["can_edit"], false);
    let read_only = send(&app, get(&format!("/api/events/{slug}"), Some(&stranger))).await;
    assert_eq!(read_only.json["can_edit"], false);
}

#[sqlx::test]
async fn update_is_for_owner_and_seed_admin_and_keeps_the_slug(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let created = create(&app, &owner, jam("Old Name")).await;
    let id = created.json["id"].as_str().unwrap();
    publish(&app, &pool, id, &owner).await;
    let uri = format!("/api/events/{id}");

    let updated = send(&app, put(&uri, jam("New Name"), Some(&owner))).await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json["name"], "New Name");
    assert_eq!(updated.json["slug"], created.json["slug"]);
    assert_eq!(
        updated.json["status"], "published",
        "PUT never changes status"
    );

    let stranger = sign_up(&app, "other@example.com").await;
    let forbidden = send(&app, put(&uri, jam("Hijack"), Some(&stranger))).await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);

    make_seed_admin(&pool, "other@example.com").await;
    let by_admin = send(&app, put(&uri, jam("Fixed"), Some(&stranger))).await;
    assert_eq!(by_admin.status, StatusCode::OK);
}

#[sqlx::test]
async fn delete_is_soft_and_owner_only(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    publish(&app, &pool, &id, &owner).await;
    let uri = format!("/api/events/{id}");

    let stranger = sign_up(&app, "other@example.com").await;
    assert_eq!(
        send(&app, delete(&uri, Some(&stranger))).await.status,
        StatusCode::FORBIDDEN
    );

    assert_eq!(
        send(&app, delete(&uri, Some(&owner))).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        send(&app, get(&uri, Some(&owner))).await.status,
        StatusCode::NOT_FOUND
    );
    let row_kept = sqlx::query_scalar!(
        r#"select deleted_at is not null as "deleted!" from events where id = $1::text::uuid"#,
        id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(row_kept);
}

#[sqlx::test]
async fn status_transitions_follow_the_machine(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;

    let completed_too_early = act(&app, &owner, &id, "complete").await;
    assert_eq!(completed_too_early.status, StatusCode::CONFLICT);
    let unreviewed = act(&app, &owner, &id, "publish").await;
    assert_eq!(
        unreviewed.status,
        StatusCode::FORBIDDEN,
        "an organiser's jam goes through review"
    );

    publish(&app, &pool, &id, &owner).await;
    for (action, status) in [
        ("close-registration", "registration_closed"),
        ("complete", "completed"),
    ] {
        let response = act(&app, &owner, &id, action).await;
        assert_eq!(response.status, StatusCode::OK, "{action}");
        assert_eq!(response.json["status"], status);
    }

    let cancel_completed = act(&app, &owner, &id, "cancel").await;
    assert_eq!(cancel_completed.status, StatusCode::CONFLICT);
    assert_eq!(cancel_completed.json["error"]["code"], "conflict");

    let stranger = sign_up(&app, "other@example.com").await;
    let other_id = draft_id(&app, &stranger, jam("Other")).await;
    assert_eq!(
        act(&app, &owner, &other_id, "publish").await.status,
        StatusCode::NOT_FOUND,
        "someone else's draft does not exist for you"
    );
    assert_eq!(
        act(&app, &stranger, &other_id, "cancel").await.json["status"],
        "cancelled"
    );
    assert_eq!(
        act(&app, &owner, &other_id, "cancel").await.status,
        StatusCode::FORBIDDEN,
        "a public jam is visible but read-only"
    );
}

#[sqlx::test]
async fn list_shows_public_jams_with_filters_and_pages(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let mut ids = Vec::new();
    for (name, starts_on, country) in [
        ("A", "2030-01-10", "FR"),
        ("B", "2030-02-10", "DE"),
        ("C", "2030-03-10", "FR"),
        ("D", "2030-04-10", "FR"),
    ] {
        let mut body = jam(name);
        body["starts_on"] = json!(starts_on);
        body["ends_on"] = json!(starts_on);
        body["country"] = json!(country);
        let id = draft_id(&app, &owner, body).await;
        publish(&app, &pool, &id, &owner).await;
        ids.push(id);
    }
    create(&app, &owner, jam("Draft")).await;
    send(
        &app,
        delete(&format!("/api/events/{}", ids[3]), Some(&owner)),
    )
    .await;

    let names = |response: &TestResponse| -> Vec<String> {
        response.json["items"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap().to_owned())
            .collect()
    };

    let all = send(&app, get("/api/events", None)).await;
    assert_eq!(names(&all), ["A", "B", "C"], "no draft, no deleted");

    let french = send(&app, get("/api/events?country=FR&from=2030-02-01", None)).await;
    assert_eq!(names(&french), ["C"]);

    let first = send(&app, get("/api/events?limit=2", None)).await;
    assert_eq!(names(&first), ["A", "B"]);
    let cursor = first.json["next_cursor"].as_str().unwrap();
    let second = send(
        &app,
        get(&format!("/api/events?limit=2&cursor={cursor}"), None),
    )
    .await;
    assert_eq!(names(&second), ["C"]);
    assert_eq!(second.json["next_cursor"], Value::Null);

    let mine = send(&app, get("/api/events?mine=true", Some(&owner))).await;
    assert_eq!(names(&mine), ["A", "B", "C", "Draft"]);
    let mine_anonymous = send(&app, get("/api/events?mine=true", None)).await;
    assert_eq!(mine_anonymous.status, StatusCode::UNAUTHORIZED);

    let bad_cursor = send(&app, get("/api/events?cursor=nope", None)).await;
    assert_eq!(bad_cursor.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn geojson_has_upcoming_public_jams_with_coordinates(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    // The BreakingJam team publishes without review.
    set_role(&pool, "org@example.com", "seed_admin").await;
    let make = async |name: &str, actions: &[&str], coords: bool| {
        let mut body = jam(name);
        if !coords {
            body["lat"] = Value::Null;
            body["lng"] = Value::Null;
        }
        let id = draft_id(&app, &owner, body).await;
        for action in actions {
            act(&app, &owner, &id, action).await;
        }
    };
    make("Published", &["publish"], true).await;
    make("Closed", &["publish", "close-registration"], true).await;
    make("Draft", &[], true).await;
    make("In review", &["submit"], true).await;
    make("Done", &["publish", "close-registration", "complete"], true).await;
    make("Nowhere", &["publish"], false).await;

    let response = send(&app, get("/api/events.geojson", None)).await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.json["type"], "FeatureCollection");
    let features = response.json["features"].as_array().unwrap();
    let names: Vec<&str> = features
        .iter()
        .map(|f| f["properties"]["name"].as_str().unwrap())
        .collect();
    assert_eq!(names.len(), 2);
    assert!(names.contains(&"Published") && names.contains(&"Closed"));
    assert_eq!(
        features[0]["geometry"],
        json!({ "type": "Point", "coordinates": [2.3522, 48.8566] })
    );
}

fn text(response: &TestResponse) -> String {
    String::from_utf8(response.bytes.clone()).unwrap()
}

#[sqlx::test]
async fn flyer_is_an_inlinable_svg_of_the_jam(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Paris Cypher Sessions")).await;
    let battle = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    send(
        &app,
        post(&format!("/api/events/{id}/battles"), battle, Some(&owner)),
    )
    .await;
    let uri = format!("/api/events/{id}/flyer.svg");

    let draft = send(&app, get(&uri, None)).await;
    assert_eq!(draft.status, StatusCode::NOT_FOUND, "drafts stay private");
    let own_draft = send(&app, get(&uri, Some(&owner))).await;
    assert_eq!(own_draft.status, StatusCode::OK);
    assert_eq!(own_draft.headers["cache-control"], "private, no-store");

    publish(&app, &pool, &id, &owner).await;
    let flyer = send(&app, get(&uri, None)).await;
    assert_eq!(flyer.status, StatusCode::OK);
    assert_eq!(
        flyer.headers["content-type"],
        "image/svg+xml; charset=utf-8"
    );
    assert_eq!(flyer.headers["cache-control"], "public, max-age=300");
    let svg = text(&flyer);
    assert!(svg.starts_with(r#"<svg xmlns="http://www.w3.org/2000/svg""#));
    // DESIGN.md §4.24: a named image, "Generated flyer: <name>, <date>, <city>".
    assert!(svg.contains(
        r#"role="img" aria-label="Generated flyer: Paris Cypher Sessions, Sat 01 Jun, Paris""#
    ));
    for printed in [
        ">SAT</text>",
        ">01</text>",
        ">JUN</text>",
        ">Paris</text>",
        "Paris · FR",
        "1V1 BBOY",
    ] {
        assert!(svg.contains(printed), "{printed} missing");
    }
    assert!(!svg.contains("CANCELLED"));
}

#[sqlx::test]
async fn flyer_speaks_the_page_language_and_shows_cancellation(pool: PgPool) {
    let app = app(pool);
    let owner = sign_up(&app, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    act(&app, &owner, &id, "cancel").await;

    let fr = text(
        &send(
            &app,
            get(&format!("/api/events/{id}/flyer.svg?lang=fr"), None),
        )
        .await,
    );
    assert!(fr.contains(">SAM</text>") && fr.contains(">JUIN</text>"));
    assert!(fr.contains(">ANNULÉ</text>"));
    assert!(fr.contains(r#"aria-label="Flyer généré : Jam, Sam 01 Juin, Paris""#));

    let compact = text(
        &send(
            &app,
            get(&format!("/api/events/{id}/flyer.svg?compact=true"), None),
        )
        .await,
    );
    assert!(compact.contains(">CANCELLED</text>"));
    assert!(
        !compact.contains("BREAKINGJAM"),
        "compact keeps date and art only"
    );
    assert!(compact.contains(r#"aria-hidden="true""#) && !compact.contains("role="));

    let unknown = send(
        &app,
        get(&format!("/api/events/{id}/flyer.svg?lang=xx"), None),
    )
    .await;
    assert_eq!(unknown.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn og_image_is_a_1200_by_630_png(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Paris Cypher Sessions")).await;
    publish(&app, &pool, &id, &owner).await;
    let slug = send(&app, get(&format!("/api/events/{id}"), None))
        .await
        .json["slug"]
        .as_str()
        .unwrap()
        .to_owned();

    let png = send(&app, get(&format!("/api/events/{slug}/og.png"), None)).await;
    assert_eq!(png.status, StatusCode::OK);
    assert_eq!(png.headers["content-type"], "image/png");
    assert_eq!(&png.bytes[..8], b"\x89PNG\r\n\x1a\n");
    assert_eq!(
        u32::from_be_bytes(png.bytes[16..20].try_into().unwrap()),
        1200
    );
    assert_eq!(
        u32::from_be_bytes(png.bytes[20..24].try_into().unwrap()),
        630
    );
}

#[sqlx::test]
async fn geojson_carries_what_the_popup_and_filters_need(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Paris Cypher Sessions")).await;
    let battles = [
        json!({ "format": "team", "team_size": 1, "gender": "bgirl", "age": "adult", "age_min": 18 }),
        json!({ "format": "team", "team_size": 5, "gender": "mixed", "age": "adult", "age_min": 18 }),
        json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "kids", "age_min": 8, "age_max": 17 }),
    ];
    for battle in battles {
        send(
            &app,
            post(&format!("/api/events/{id}/battles"), battle, Some(&owner)),
        )
        .await;
    }
    publish(&app, &pool, &id, &owner).await;

    let response = send(&app, get("/api/events.geojson", None)).await;
    let properties = &response.json["features"][0]["properties"];
    assert_eq!(properties["ends_on"], "2030-06-02");
    assert_eq!(properties["status"], "published");
    assert_eq!(
        properties["battles"],
        json!(["1v1 Bgirl", "5v5 Mixed", "1v1 Bboy Kids"])
    );
    // Each category once, in a stable order, whichever battles it came from.
    assert_eq!(
        properties["categories"],
        json!(["one_v_one", "crew", "bgirl", "kids"])
    );
}
