mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{
    Files, TestResponse, app, delete, get, post, post_files, publish, put, send, set_role, sign_up,
};

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
        "instagram_url": null,
        // The publish checklist wants a way to reach the organiser (Instagram or email).
        "contact_email": "crew@example.com"
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

/// Gives the jam the battle it needs to go public.
async fn add_battle(app: &Router, cookie: &str, id: &str) {
    let battle = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    let uri = format!("/api/events/{id}/battles");
    let added = send(app, post(&uri, battle, Some(cookie))).await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.json);
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
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "org@example.com").await;

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

    let mut reachable = jam("Reachable Jam");
    reachable["website_url"] = json!(" https://pariscypher.com ");
    reachable["contact_email"] = json!(" hello@pariscypher.com ");
    let created = create(&app, &cookie, reachable).await;
    assert_eq!(created.json["website_url"], "https://pariscypher.com");
    assert_eq!(created.json["contact_email"], "hello@pariscypher.com");

    let me = send(&app, get("/api/auth/me", Some(&cookie))).await;
    assert_eq!(me.json["role"], "organizer");
}

#[sqlx::test]
async fn a_draft_starts_from_a_name_and_a_day_and_fills_in_later(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "org@example.com").await;
    let start = json!({ "name": "Winter Cypher Jam", "starts_on": "2030-12-12",
                        "ends_on": "2030-12-12", "timezone": "Europe/Zurich" });
    let created = create(&app, &cookie, start).await;
    assert_eq!(created.status, StatusCode::CREATED, "{}", created.json);
    assert_eq!(created.json["city"], Value::Null);
    assert_eq!(created.json["country"], Value::Null);
    assert_eq!(created.json["opens_at"], Value::Null);
    let id = created.json["id"].as_str().unwrap();

    // Its page and flyer work from that moment, without a place.
    let page = send(&app, get(&format!("/api/events/{id}"), Some(&cookie))).await;
    assert_eq!(page.status, StatusCode::OK);
    let flyer = send(
        &app,
        get(&format!("/api/events/{id}/flyer.svg"), Some(&cookie)),
    )
    .await;
    assert!(
        text(&flyer).contains(r#"aria-label="Generated flyer: Winter Cypher Jam, Thu 12 Dec""#)
    );

    let mut timed = jam("Winter Cypher Jam");
    timed["city"] = json!("  ");
    timed["opens_at"] = json!("14:00");
    timed["closes_at"] = json!("21:30");
    let updated = send(
        &app,
        put(&format!("/api/events/{id}"), timed, Some(&cookie)),
    )
    .await;
    assert_eq!(updated.status, StatusCode::OK, "{}", updated.json);
    assert_eq!(updated.json["city"], Value::Null, "a blank city is none");
    assert_eq!(updated.json["opens_at"], "14:00:00");
    assert_eq!(updated.json["closes_at"], "21:30:00");
    let flyer = send(
        &app,
        get(&format!("/api/events/{id}/flyer.svg"), Some(&cookie)),
    )
    .await;
    assert!(text(&flyer).contains(">14:00–21:30</text>"));
}

#[sqlx::test]
async fn a_jam_past_draft_keeps_its_place(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    publish(&pool, &id).await;
    let uri = format!("/api/events/{id}");

    for (field, value) in [
        ("city", Value::Null),
        ("city", json!("  ")),
        ("country", Value::Null),
        ("lat", Value::Null),
    ] {
        let mut body = jam("Jam");
        body[field] = value;
        if field == "lat" {
            body["lng"] = Value::Null;
        }
        let refused = send(&app, put(&uri, body, Some(&owner))).await;
        assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY, "{field}");
        assert_eq!(
            refused.json["error"]["fields"][0]["field"], "place",
            "{field}"
        );
    }
    let moved = send(&app, put(&uri, jam("Jam moved"), Some(&owner))).await;
    assert_eq!(moved.status, StatusCode::OK);

    // A draft may still lose its place: the checklist catches it before it goes public.
    let draft = draft_id(&app, &owner, jam("Draft")).await;
    let mut cleared = jam("Draft");
    cleared["city"] = Value::Null;
    let saved = send(
        &app,
        put(&format!("/api/events/{draft}"), cleared, Some(&owner)),
    )
    .await;
    assert_eq!(saved.status, StatusCode::OK);
    assert_eq!(saved.json["city"], Value::Null);
}

#[sqlx::test]
async fn a_public_jam_that_never_had_a_place_keeps_saving(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;

    // Published before the checklist, without a pin.
    let mut pinless = jam("Old Jam");
    pinless["lat"] = Value::Null;
    pinless["lng"] = Value::Null;
    let old = draft_id(&app, &owner, pinless.clone()).await;
    publish(&pool, &old).await;
    let uri = format!("/api/events/{old}");
    let edited = send(&app, put(&uri, pinless, Some(&owner))).await;
    assert_eq!(edited.status, StatusCode::OK, "{}", edited.json);
    let pinned = send(&app, put(&uri, jam("Old Jam"), Some(&owner))).await;
    assert_eq!(pinned.status, StatusCode::OK, "{}", pinned.json);
}

#[sqlx::test]
async fn a_venue_less_draft_still_has_its_calendar_and_share_image(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let start = json!({ "name": "Winter Cypher Jam", "starts_on": "2030-12-12",
                        "ends_on": "2030-12-12", "timezone": "Europe/Zurich", "venue_name": "Dynamo" });
    let id = draft_id(&app, &owner, start).await;

    let ics = send(
        &app,
        get(&format!("/api/events/{id}/calendar.ics"), Some(&owner)),
    )
    .await;
    assert_eq!(ics.status, StatusCode::OK);
    assert!(
        text(&ics).contains("\r\nLOCATION:Dynamo\r\n"),
        "{}",
        text(&ics)
    );
    let png = send(&app, get(&format!("/api/events/{id}/og.png"), Some(&owner))).await;
    assert_eq!(png.status, StatusCode::OK);
    assert_eq!(&png.bytes[..8], b"\x89PNG\r\n\x1a\n");
}

#[sqlx::test]
async fn opening_hours_are_clock_times(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "org@example.com").await;
    let mut body = jam("Jam");
    body["opens_at"] = json!("25:00");
    let response = create(&app, &cookie, body.clone()).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response.json["error"]["fields"][0]["field"], "body");

    body["opens_at"] = json!("14:00");
    body["closes_at"] = json!("9pm");
    let response = create(&app, &cookie, body.clone()).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);

    body["closes_at"] = Value::Null;
    let response = create(&app, &cookie, body).await;
    assert_eq!(response.status, StatusCode::CREATED, "{}", response.json);
    assert_eq!(response.json["opens_at"], "14:00:00");
    assert_eq!(response.json["closes_at"], Value::Null);
}

#[sqlx::test]
async fn going_public_needs_the_place_a_battle_and_a_contact(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let mut unplaced = jam("Jam");
    unplaced["city"] = Value::Null;
    unplaced["contact_email"] = Value::Null;
    let id = draft_id(&app, &owner, unplaced).await;

    let refused = act(&app, &owner, &id, "submit").await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<&str> = refused.json["error"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["field"].as_str().unwrap())
        .collect();
    assert_eq!(fields, ["place", "battles", "contact"]);

    let placed = send(
        &app,
        put(&format!("/api/events/{id}"), jam("Jam"), Some(&owner)),
    )
    .await;
    assert_eq!(placed.status, StatusCode::OK);
    let still_refused = act(&app, &owner, &id, "submit").await;
    assert_eq!(still_refused.json["error"]["fields"][0]["field"], "battles");

    add_battle(&app, &owner, &id).await;
    let submitted = act(&app, &owner, &id, "submit").await;
    assert_eq!(submitted.status, StatusCode::OK, "{}", submitted.json);
    assert_eq!(submitted.json["status"], "in_review");

    // The team's direct publish runs the same checklist.
    let team = sign_up(&app, &pool, "team@example.com").await;
    make_seed_admin(&pool, "team@example.com").await;
    let mut pinless = jam("Team Jam");
    pinless["lat"] = Value::Null;
    pinless["lng"] = Value::Null;
    let team_id = draft_id(&app, &team, pinless).await;
    add_battle(&app, &team, &team_id).await;
    let refused = act(&app, &team, &team_id, "publish").await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "place");
}

#[sqlx::test]
async fn create_requires_login(pool: PgPool) {
    let response = send(&app(pool), post("/api/events", jam("Jam"), None)).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn create_validates_fields_then_cross_field_rules(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "org@example.com").await;

    let mut bad = jam(" ");
    bad["country"] = json!("fr");
    bad["timezone"] = json!("Paris");
    bad["website_url"] = json!("pariscypher.com");
    bad["contact_email"] = json!("hello at pariscypher");
    // A short pitch: 200 characters at most.
    bad["description"] = json!("x".repeat(201));
    let response = create(&app, &cookie, bad).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<&str> = response.json["error"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["field"].as_str().unwrap())
        .collect();
    assert_eq!(
        fields,
        [
            "contact_email",
            "country",
            "description",
            "name",
            "timezone",
            "website_url"
        ]
    );

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
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let created = create(&app, &owner, jam("Secret Jam")).await;
    let id = created.json["id"].as_str().unwrap();
    let slug = created.json["slug"].as_str().unwrap();

    let by_slug = send(&app, get(&format!("/api/events/{slug}"), Some(&owner))).await;
    assert_eq!(by_slug.status, StatusCode::OK);
    assert_eq!(by_slug.json["id"], id);
    assert_eq!(by_slug.json["can_edit"], true);

    let anonymous = send(&app, get(&format!("/api/events/{id}"), None)).await;
    assert_eq!(anonymous.status, StatusCode::NOT_FOUND);
    let stranger = sign_up(&app, &pool, "other@example.com").await;
    let other = send(&app, get(&format!("/api/events/{id}"), Some(&stranger))).await;
    assert_eq!(other.status, StatusCode::NOT_FOUND);

    let admin = sign_up(&app, &pool, "seed@example.com").await;
    make_seed_admin(&pool, "seed@example.com").await;
    let seen = send(&app, get(&format!("/api/events/{id}"), Some(&admin))).await;
    assert_eq!(seen.status, StatusCode::OK);
    assert_eq!(seen.json["can_edit"], true, "seed_admin writes any jam");

    publish(&pool, id).await;
    let public = send(&app, get(&format!("/api/events/{slug}"), None)).await;
    assert_eq!(public.status, StatusCode::OK);
    assert_eq!(public.json["can_edit"], false);
    let read_only = send(&app, get(&format!("/api/events/{slug}"), Some(&stranger))).await;
    assert_eq!(read_only.json["can_edit"], false);
}

#[sqlx::test]
async fn update_is_for_owner_and_seed_admin_and_keeps_the_slug(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let created = create(&app, &owner, jam("Old Name")).await;
    let id = created.json["id"].as_str().unwrap();
    publish(&pool, id).await;
    let uri = format!("/api/events/{id}");

    let updated = send(&app, put(&uri, jam("New Name"), Some(&owner))).await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json["name"], "New Name");
    assert_eq!(updated.json["slug"], created.json["slug"]);
    assert_eq!(
        updated.json["status"], "published",
        "PUT never changes status"
    );

    let stranger = sign_up(&app, &pool, "other@example.com").await;
    let forbidden = send(&app, put(&uri, jam("Hijack"), Some(&stranger))).await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);

    make_seed_admin(&pool, "other@example.com").await;
    let by_admin = send(&app, put(&uri, jam("Fixed"), Some(&stranger))).await;
    assert_eq!(by_admin.status, StatusCode::OK);
}

#[sqlx::test]
async fn calendar_file_is_one_all_day_event_over_the_jams_days(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &cookie, jam("Paris; Cypher, Sessions")).await;
    let uri = format!("/api/events/{id}/calendar.ics");
    // A draft is as hidden here as on its page.
    assert_eq!(
        send(&app, get(&uri, None)).await.status,
        StatusCode::NOT_FOUND
    );
    publish(&pool, &id).await;

    let file = send(&app, get(&uri, None)).await;
    assert_eq!(file.status, StatusCode::OK);
    assert_eq!(file.headers["content-type"], "text/calendar; charset=utf-8");
    assert!(
        file.headers["content-disposition"]
            .to_str()
            .unwrap()
            .starts_with("attachment")
    );
    let ics = String::from_utf8(file.bytes).unwrap();
    assert!(ics.starts_with("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
    assert!(ics.contains("\r\nDTSTART;VALUE=DATE:20300601\r\n"));
    // The end is exclusive: the jam's last day is 2 June.
    assert!(ics.contains("\r\nDTEND;VALUE=DATE:20300603\r\n"));
    assert!(ics.contains("\r\nSUMMARY:Paris\\; Cypher\\, Sessions\r\n"));
    assert!(ics.contains("\r\nLOCATION:Le Hangar\\, Paris\\, FR\r\n"));
    assert!(ics.contains(&format!("\r\nUID:{id}@breakingjam.com\r\n")));
    assert!(ics.ends_with("END:VEVENT\r\nEND:VCALENDAR\r\n"));
}

#[sqlx::test]
async fn jams_the_team_entered_name_no_organiser(pool: PgPool) {
    let app = app(pool.clone());
    let team = sign_up(&app, &pool, "team@example.com").await;
    make_seed_admin(&pool, "team@example.com").await;
    let id = draft_id(&app, &team, jam("Imported")).await;
    add_battle(&app, &team, &id).await;
    act(&app, &team, &id, "publish").await;

    let page = send(&app, get(&format!("/api/events/{id}"), None)).await;
    assert_eq!(page.status, StatusCode::OK);
    assert_eq!(page.json["organizer"], Value::Null);
}

#[sqlx::test]
async fn delete_is_soft_and_owner_only(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    publish(&pool, &id).await;
    let uri = format!("/api/events/{id}");

    let stranger = sign_up(&app, &pool, "other@example.com").await;
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
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;

    let closed_too_early = act(&app, &owner, &id, "close-registration").await;
    assert_eq!(closed_too_early.status, StatusCode::CONFLICT);
    let gone = act(&app, &owner, &id, "complete").await;
    assert_eq!(
        gone.status,
        StatusCode::NOT_FOUND,
        "a jam is over by its dates"
    );
    let unreviewed = act(&app, &owner, &id, "publish").await;
    assert_eq!(
        unreviewed.status,
        StatusCode::FORBIDDEN,
        "an organiser's jam goes through review"
    );

    publish(&pool, &id).await;
    for (action, status) in [
        ("close-registration", "registration_closed"),
        ("cancel", "cancelled"),
    ] {
        let response = act(&app, &owner, &id, action).await;
        assert_eq!(response.status, StatusCode::OK, "{action}");
        assert_eq!(response.json["status"], status);
    }

    let cancel_twice = act(&app, &owner, &id, "cancel").await;
    assert_eq!(cancel_twice.status, StatusCode::CONFLICT);
    assert_eq!(cancel_twice.json["error"]["code"], "conflict");

    let stranger = sign_up(&app, &pool, "other@example.com").await;
    let other_id = draft_id(&app, &stranger, jam("Other")).await;
    assert_eq!(
        act(&app, &owner, &other_id, "publish").await.status,
        StatusCode::NOT_FOUND,
        "someone else's draft does not exist for you"
    );
    // A cancelled jam is public: a draft can't become one without its review.
    let unseen = act(&app, &stranger, &other_id, "cancel").await;
    assert_eq!(unseen.status, StatusCode::CONFLICT);
    let hidden = send(&app, get(&format!("/api/events/{other_id}"), None)).await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    publish(&pool, &other_id).await;
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
    let owner = sign_up(&app, &pool, "org@example.com").await;
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
        publish(&pool, &id).await;
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
async fn geojson_has_public_jams_with_coordinates_past_ones_included(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    // The BreakingJam team publishes without review.
    set_role(&pool, "org@example.com", "seed_admin").await;
    let make = async |name: &str, actions: &[&str]| {
        let id = draft_id(&app, &owner, jam(name)).await;
        add_battle(&app, &owner, &id).await;
        for action in actions {
            let moved = act(&app, &owner, &id, action).await;
            assert_eq!(moved.status, StatusCode::OK, "{name}: {}", moved.json);
        }
    };
    make("Published", &["publish"]).await;
    make("Closed", &["publish", "close-registration"]).await;
    make("Draft", &[]).await;
    make("In review", &["submit"]).await;
    let mut done = jam("Done");
    done["starts_on"] = json!("2020-06-01");
    done["ends_on"] = json!("2020-06-01");
    let id = draft_id(&app, &owner, done).await;
    add_battle(&app, &owner, &id).await;
    assert_eq!(
        act(&app, &owner, &id, "publish").await.status,
        StatusCode::OK
    );

    let response = send(&app, get("/api/events.geojson", None)).await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.json["type"], "FeatureCollection");
    let features = response.json["features"].as_array().unwrap();
    let names: Vec<&str> = features
        .iter()
        .map(|f| f["properties"]["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Done", "Published", "Closed"]);
    let phases: Vec<&str> = features
        .iter()
        .map(|f| f["properties"]["phase"].as_str().unwrap())
        .collect();
    assert_eq!(phases, ["past", "upcoming", "upcoming"]);
    assert_eq!(
        features[1]["geometry"],
        json!({ "type": "Point", "coordinates": [2.3522, 48.8566] })
    );
}

fn text(response: &TestResponse) -> String {
    String::from_utf8(response.bytes.clone()).unwrap()
}

#[sqlx::test]
async fn flyer_is_an_inlinable_svg_of_the_jam(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
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

    publish(&pool, &id).await;
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
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    publish(&pool, &id).await;
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
    assert_eq!(unknown.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(unknown.json["error"]["fields"][0]["field"], "query");
}

#[sqlx::test]
async fn og_image_is_a_1200_by_630_png(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Paris Cypher Sessions")).await;
    publish(&pool, &id).await;
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
    let owner = sign_up(&app, &pool, "org@example.com").await;
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
    publish(&pool, &id).await;

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

/// An entry in the jam's first battle, as an organiser records it after the jam.
async fn add_entry(pool: &PgPool, jam: &str, video_url: Option<&str>, status: &str) {
    sqlx::query!(
        "insert into entries (id, battle_id, status, video_url)
         select gen_random_uuid(), id, $3::text::entry_status, $2
         from battles where event_id = $1::text::uuid order by position limit 1",
        jam,
        video_url,
        status,
    )
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn geojson_says_which_live_or_past_jams_have_videos(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let video = Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    let new_jam = async |name: &str, day: &str| {
        let mut body = jam(name);
        body["starts_on"] = json!(day);
        body["ends_on"] = json!(day);
        let id = draft_id(&app, &owner, body).await;
        add_battle(&app, &owner, &id).await;
        publish(&pool, &id).await;
        id
    };
    let filmed = new_jam("Filmed", "2020-06-01").await;
    add_entry(&pool, &filmed, None, "confirmed").await;
    add_entry(&pool, &filmed, video, "confirmed").await;
    let unfilmed = new_jam("Unfilmed", "2020-06-02").await;
    add_entry(&pool, &unfilmed, None, "confirmed").await;
    let withdrawn = new_jam("Withdrawn", "2020-06-03").await;
    add_entry(&pool, &withdrawn, video, "withdrawn").await;
    let upcoming = new_jam("Upcoming", "2030-06-01").await;
    add_entry(&pool, &upcoming, video, "confirmed").await;

    let response = send(&app, get("/api/events.geojson", None)).await;
    let has_videos: Vec<(&str, bool)> = response.json["features"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| {
            let jam = &f["properties"];
            (
                jam["name"].as_str().unwrap(),
                jam["has_videos"].as_bool().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        has_videos,
        [
            ("Filmed", true),
            ("Unfilmed", false),
            ("Withdrawn", false),
            ("Upcoming", false)
        ]
    );
}

#[sqlx::test]
async fn a_public_jam_that_is_over_keeps_only_its_battles_open(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let mut body = jam("Over");
    body["starts_on"] = json!("2020-06-01");
    body["ends_on"] = json!("2020-06-01");
    let id = draft_id(&app, &owner, body.clone()).await;
    let uri = format!("/api/events/{id}");

    // A draft whose days went by can still be moved: nobody saw it.
    body["ends_on"] = json!("2020-06-02");
    let moved = send(&app, put(&uri, body.clone(), Some(&owner))).await;
    assert_eq!(moved.status, StatusCode::OK);
    assert_eq!(moved.json["phase"], "past");
    add_battle(&app, &owner, &id).await;
    publish(&pool, &id).await;

    let page = send(&app, get(&uri, Some(&owner))).await;
    assert_eq!(page.json["phase"], "past");
    assert_eq!(page.json["can_edit"], false);
    assert_eq!(page.json["can_edit_battles"], true);
    assert_eq!(page.json["actions"], json!([]));

    let over = |response: TestResponse| {
        assert_eq!(response.status, StatusCode::CONFLICT, "{}", response.json);
    };
    over(send(&app, put(&uri, body.clone(), Some(&owner))).await);
    over(send(&app, delete(&uri, Some(&owner))).await);
    over(act(&app, &owner, &id, "cancel").await);
    over(send(&app, put(&format!("{uri}/staff"), json!([]), Some(&owner))).await);
    over(send(&app, delete(&format!("{uri}/flyer"), Some(&owner))).await);
    let flyer: &Files = &[("flyer", b"jpeg"), ("card", b"jpeg")];
    over(
        send(
            &app,
            post_files(&format!("{uri}/flyer"), flyer, Some(&owner)),
        )
        .await,
    );

    // Its battles, entries and results are still recorded.
    let battle = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    let added = send(
        &app,
        post(&format!("{uri}/battles"), battle.clone(), Some(&owner)),
    )
    .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.json);
    let battle_uri = format!("/api/battles/{}", added.json["id"].as_str().unwrap());
    let renamed = json!({ "name": "Final 1v1", "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    assert_eq!(
        send(&app, put(&battle_uri, renamed, Some(&owner)))
            .await
            .status,
        StatusCode::OK
    );
    let dancer = json!({ "dancer_name": "Lil G", "country": "FR" });
    let dancer = send(&app, post("/api/dancers", dancer, Some(&owner)))
        .await
        .json["id"]
        .clone();
    let entry = json!({ "dancer_ids": [dancer] });
    let entered = send(
        &app,
        post(&format!("{battle_uri}/entries"), entry, Some(&owner)),
    )
    .await;
    assert_eq!(entered.status, StatusCode::CREATED, "{}", entered.json);
    let result = json!({ "dancer_ids": [dancer], "status": "confirmed", "reached": "winner",
                         "video_url": "https://youtu.be/dQw4w9WgXcQ" });
    let entry_uri = format!("/api/entries/{}", entered.json["id"].as_str().unwrap());
    assert_eq!(
        send(&app, put(&entry_uri, result, Some(&owner)))
            .await
            .status,
        StatusCode::OK
    );

    // The team fixes history.
    let team = sign_up(&app, &pool, "team@example.com").await;
    set_role(&pool, "team@example.com", "seed_admin").await;
    let fixed = send(&app, put(&uri, body, Some(&team))).await;
    assert_eq!(fixed.status, StatusCode::OK);
    let page = send(&app, get(&uri, Some(&team))).await;
    assert_eq!(page.json["can_edit"], true);
    assert_eq!(
        page.json["actions"],
        json!(["close-registration", "cancel"])
    );
}

#[sqlx::test]
async fn the_jam_page_says_what_its_writer_may_do(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    let uri = format!("/api/events/{id}");
    let draft = send(&app, get(&uri, Some(&owner))).await;
    assert_eq!(draft.json["phase"], "upcoming");
    assert_eq!(draft.json["can_edit"], true);
    assert_eq!(draft.json["actions"], json!(["submit"]));

    publish(&pool, &id).await;
    let visitor = send(&app, get(&uri, None)).await;
    assert_eq!(visitor.json["can_edit"], false);
    assert_eq!(visitor.json["can_edit_battles"], false);
    assert_eq!(visitor.json["actions"], json!([]));
}

#[sqlx::test]
async fn a_timezone_postgres_does_not_know_is_refused(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let mut body = jam("Jam");
    body["timezone"] = json!("Europe/Atlantis");
    let refused = create(&app, &owner, body.clone()).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "timezone");

    let id = draft_id(&app, &owner, jam("Jam")).await;
    let refused = send(&app, put(&format!("/api/events/{id}"), body, Some(&owner))).await;
    assert_eq!(refused.json["error"]["fields"][0]["field"], "timezone");
}

#[sqlx::test]
async fn the_checklist_holds_once_submitted(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let admin = sign_up(&app, &pool, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let id = draft_id(&app, &owner, jam("Jam")).await;
    add_battle(&app, &owner, &id).await;
    add_battle(&app, &owner, &id).await;
    assert_eq!(
        act(&app, &owner, &id, "submit").await.status,
        StatusCode::OK
    );

    // In review, the way to reach the organiser stays: swapped for another, never dropped.
    let mut unreachable = jam("Jam");
    unreachable["contact_email"] = json!("  ");
    let dropped = send(
        &app,
        put(&format!("/api/events/{id}"), unreachable, Some(&owner)),
    )
    .await;
    assert_eq!(dropped.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(dropped.json["error"]["fields"][0]["field"], "contact");
    let mut swapped = jam("Jam");
    swapped["contact_email"] = Value::Null;
    swapped["instagram_url"] = json!("https://www.instagram.com/paris.jam");
    let swapped = send(
        &app,
        put(&format!("/api/events/{id}"), swapped, Some(&owner)),
    )
    .await;
    assert_eq!(swapped.status, StatusCode::OK, "{}", swapped.json);

    let battles = send(
        &app,
        get(&format!("/api/events/{id}/battles"), Some(&owner)),
    )
    .await;
    let ids: Vec<&str> = battles
        .json
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["id"].as_str().unwrap())
        .collect();
    let first = send(
        &app,
        delete(&format!("/api/battles/{}", ids[0]), Some(&owner)),
    )
    .await;
    assert_eq!(first.status, StatusCode::NO_CONTENT);
    let last = send(
        &app,
        delete(&format!("/api/battles/{}", ids[1]), Some(&owner)),
    )
    .await;
    assert_eq!(last.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(last.json["error"]["fields"][0]["field"], "battles");

    // Approval checks again: a jam that lost its battles some other way stays in review.
    sqlx::query!("delete from battles where event_id = $1::text::uuid", id)
        .execute(&pool)
        .await
        .unwrap();
    let uri = format!("/api/admin/events/{id}/approve");
    let refused = send(&app, post(&uri, json!({}), Some(&admin))).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "battles");
}

#[sqlx::test]
async fn an_id_that_does_not_parse_is_not_found(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    for uri in [
        "/api/events/nope/battles",
        "/api/dancers/nope/events",
        "/api/organizers/nope",
    ] {
        let response = send(&app, get(uri, Some(&owner))).await;
        assert_eq!(response.status, StatusCode::NOT_FOUND, "{uri}");
        assert_eq!(response.json["error"]["code"], "not_found", "{uri}");
    }
}

#[sqlx::test]
async fn an_organiser_cannot_move_a_public_jam_into_the_past(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let mut body = jam("Jam");
    let id = draft_id(&app, &owner, body.clone()).await;
    let uri = format!("/api/events/{id}");
    add_battle(&app, &owner, &id).await;
    publish(&pool, &id).await;

    // One mistyped date would lock them out of putting it back.
    body["starts_on"] = json!("2020-06-01");
    body["ends_on"] = json!("2020-06-01");
    let refused = send(&app, put(&uri, body.clone(), Some(&owner))).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "ends_on");

    let team = sign_up(&app, &pool, "team@example.com").await;
    set_role(&pool, "team@example.com", "seed_admin").await;
    let fixed = send(&app, put(&uri, body, Some(&team))).await;
    assert_eq!(fixed.status, StatusCode::OK, "the team records history");
}
