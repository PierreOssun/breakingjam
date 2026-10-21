mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, delete, get, id_of, post, put, send, set_role, sign_up};
use uuid::Uuid;

fn dancer(name: &str, handle: Option<&str>) -> Value {
    json!({
        "dancer_name": name,
        "aliases": [],
        "real_name": " ",
        "country": "FR",
        "country2": null,
        "city": "Paris",
        "bio": null,
        "instagram_handle": handle
    })
}

async fn create(app: &Router, cookie: &str, body: Value) -> TestResponse {
    send(app, post("/api/dancers", body, Some(cookie))).await
}

fn names(response: &TestResponse) -> Vec<String> {
    response.json["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["dancer_name"].as_str().unwrap().to_owned())
        .collect()
}

#[sqlx::test]
async fn create_normalises_and_sets_source_from_role(pool: PgPool) {
    let app = app(pool.clone());
    let user = sign_up(&app, "user@example.com").await;
    let created = create(&app, &user, dancer("Lil G", Some(" @Lil_G "))).await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.json["instagram_handle"], "lil_g");
    assert_eq!(created.json["real_name"], Value::Null);
    assert_eq!(created.json["source"], "self");
    assert_eq!(created.json["can_edit"], true);
    for hidden in ["notable", "user_id", "created_by"] {
        assert!(
            created.json.get(hidden).is_none(),
            "{hidden} is never exposed"
        );
    }

    let organizer = sign_up(&app, "org@example.com").await;
    set_role(&pool, "org@example.com", "organizer").await;
    let by_organizer = create(&app, &organizer, dancer("Ventus", None)).await;
    assert_eq!(by_organizer.json["source"], "organizer");

    let seeder = sign_up(&app, "seed@example.com").await;
    set_role(&pool, "seed@example.com", "seed_admin").await;
    let by_seeder = create(&app, &seeder, dancer("Atlas", None)).await;
    assert_eq!(by_seeder.json["source"], "seed");
}

#[sqlx::test]
async fn handle_is_unique_but_names_are_not(pool: PgPool) {
    let app = app(pool);
    let cookie = sign_up(&app, "user@example.com").await;
    create(&app, &cookie, dancer("Lil G", Some("lilg"))).await;

    let same_handle = create(&app, &cookie, dancer("Other", Some("@LILG"))).await;
    assert_eq!(same_handle.status, StatusCode::CONFLICT);

    let same_name = create(&app, &cookie, dancer("Lil G", Some("lilg_paris"))).await;
    assert_eq!(same_name.status, StatusCode::CREATED);
    let no_handle = create(&app, &cookie, dancer("Lil G", None)).await;
    assert_eq!(no_handle.status, StatusCode::CREATED);

    // Taking someone's handle on an edit is refused too.
    let id = no_handle.json["id"].as_str().unwrap();
    let taken = send(
        &app,
        put(
            &format!("/api/dancers/{id}"),
            dancer("Lil G", Some("LilG")),
            Some(&cookie),
        ),
    )
    .await;
    assert_eq!(taken.status, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn create_validates_fields(pool: PgPool) {
    let app = app(pool);
    let cookie = sign_up(&app, "user@example.com").await;
    let mut bad = dancer(" ", Some("lil g"));
    bad["country"] = json!("France");
    bad["aliases"] = json!(["ok", " "]);

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
        ["aliases", "country", "dancer_name", "instagram_handle"]
    );

    let anonymous = send(&app, post("/api/dancers", dancer("X", None), None)).await;
    assert_eq!(anonymous.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn search_matches_name_alias_and_handle_notable_first(pool: PgPool) {
    let app = app(pool.clone());
    let seeder = sign_up(&app, "seed@example.com").await;
    let user = sign_up(&app, "user@example.com").await;

    create(&app, &user, dancer("Kid Rockett", None)).await;
    set_role(&pool, "seed@example.com", "seed_admin").await;
    create(&app, &seeder, dancer("Kid Rocket", Some("kidrocket"))).await;
    let mut korean = dancer("Hong 10", Some("hong10"));
    // A 100-character alias is 300 bytes; aliases count characters like names do.
    korean["aliases"] = json!(["홍텐", "텐".repeat(100)]);
    korean["country"] = json!("KR");
    korean["country2"] = json!("FR");
    assert_eq!(
        create(&app, &user, korean).await.status,
        StatusCode::CREATED
    );
    let deleted = id_of(&create(&app, &seeder, dancer("Kid Gone", None)).await);
    send(
        &app,
        delete(&format!("/api/dancers/{deleted}"), Some(&seeder)),
    )
    .await;

    let kids = send(&app, get("/api/dancers?q=kid", None)).await;
    assert_eq!(
        names(&kids),
        ["Kid Rocket", "Kid Rockett"],
        "notable first, deleted hidden"
    );

    let by_alias = send(&app, get("/api/dancers?q=%ED%99%8D%ED%85%90", None)).await;
    assert_eq!(names(&by_alias), ["Hong 10"]);
    let by_handle = send(&app, get("/api/dancers?q=%40hong", None)).await;
    assert_eq!(names(&by_handle), ["Hong 10"]);
    let by_second_flag = send(&app, get("/api/dancers?country=KR", None)).await;
    assert_eq!(names(&by_second_flag), ["Hong 10"]);
    let wildcard = send(&app, get("/api/dancers?q=_", None)).await;
    assert!(names(&wildcard).is_empty(), "_ is literal, not a wildcard");
    let bare_at = send(&app, get("/api/dancers?q=%40", None)).await;
    assert_eq!(names(&bare_at).len(), 3, "a bare @ is an empty query");

    let first = send(&app, get("/api/dancers?q=kid&limit=1", None)).await;
    assert_eq!(names(&first), ["Kid Rocket"]);
    let cursor = first.json["next_cursor"].as_str().unwrap();
    let second = send(
        &app,
        get(&format!("/api/dancers?q=kid&limit=1&cursor={cursor}"), None),
    )
    .await;
    assert_eq!(names(&second), ["Kid Rockett"]);
    assert_eq!(second.json["next_cursor"], Value::Null);
}

#[sqlx::test]
async fn profile_shows_can_edit_per_caller(pool: PgPool) {
    let app = app(pool);
    let creator = sign_up(&app, "creator@example.com").await;
    let stranger = sign_up(&app, "stranger@example.com").await;
    let id = id_of(&create(&app, &creator, dancer("Lil G", None)).await);
    let uri = format!("/api/dancers/{id}");

    assert_eq!(
        send(&app, get(&uri, Some(&creator))).await.json["can_edit"],
        true
    );
    assert_eq!(
        send(&app, get(&uri, Some(&stranger))).await.json["can_edit"],
        false
    );
    let anonymous = send(&app, get(&uri, None)).await;
    assert_eq!(anonymous.status, StatusCode::OK);
    assert_eq!(anonymous.json["can_edit"], false);

    let missing = send(&app, get(&format!("/api/dancers/{}", Uuid::now_v7()), None)).await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn update_rights_follow_verification(pool: PgPool) {
    let app = app(pool.clone());
    let creator = sign_up(&app, "creator@example.com").await;
    let owner = sign_up(&app, "owner@example.com").await;
    let id = id_of(&create(&app, &creator, dancer("Lil G", None)).await);
    let uri = format!("/api/dancers/{id}");

    let by_creator = send(
        &app,
        put(&uri, dancer("Lil G.", Some("lilg")), Some(&creator)),
    )
    .await;
    assert_eq!(by_creator.status, StatusCode::OK);
    assert_eq!(by_creator.json["dancer_name"], "Lil G.");
    let by_owner_early = send(&app, put(&uri, dancer("Mine", None), Some(&owner))).await;
    assert_eq!(by_owner_early.status, StatusCode::FORBIDDEN);

    // What an approved claim (M7b) will do.
    sqlx::query!(
        "update dancers set verified_at = now(),
           user_id = (select id from app_users where email = 'owner@example.com')
         where id = $1::text::uuid",
        id
    )
    .execute(&pool)
    .await
    .unwrap();

    let by_owner = send(&app, put(&uri, dancer("Lil G", None), Some(&owner))).await;
    assert_eq!(by_owner.status, StatusCode::OK);
    let by_creator_late = send(&app, put(&uri, dancer("Nope", None), Some(&creator))).await;
    assert_eq!(by_creator_late.status, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn delete_is_seed_admin_only_and_soft(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = sign_up(&app, "org@example.com").await;
    set_role(&pool, "org@example.com", "organizer").await;
    let id = id_of(&create(&app, &organizer, dancer("Lil G", None)).await);
    let uri = format!("/api/dancers/{id}");

    assert_eq!(
        send(&app, delete(&uri, Some(&organizer))).await.status,
        StatusCode::FORBIDDEN
    );
    set_role(&pool, "org@example.com", "seed_admin").await;
    assert_eq!(
        send(&app, delete(&uri, Some(&organizer))).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        send(&app, get(&uri, None)).await.status,
        StatusCode::NOT_FOUND
    );
}

/// A jam `days` from today with one battle; returns (event id, battle id).
async fn jam(pool: &PgPool, name: &str, days: i32, status: &str) -> (Uuid, Uuid) {
    let organizer = sqlx::query_scalar!("select id from app_users limit 1")
        .fetch_one(pool)
        .await
        .unwrap();
    let event = Uuid::now_v7();
    sqlx::query!(
        "insert into events (id, organizer_id, name, slug, status, starts_on, ends_on, timezone, city, country)
         values ($1, $2, $3, $4, $5::text::event_status, current_date + $6::int, current_date + $6::int,
                 'Europe/Paris', 'Paris', 'FR')",
        event,
        organizer,
        name,
        format!("{name}-{event}"),
        status,
        days,
    )
    .execute(pool)
    .await
    .unwrap();
    let battle = Uuid::now_v7();
    sqlx::query!(
        "insert into battles (id, event_id, name, format, team_size, gender, age, age_min)
         values ($1, $2, '1v1 Bboy', 'team', 1, 'bboy', 'adult', 18)",
        battle,
        event,
    )
    .execute(pool)
    .await
    .unwrap();
    (event, battle)
}

async fn enter(pool: &PgPool, battle: Uuid, dancer: Uuid, reached: &str) {
    let entry = Uuid::now_v7();
    sqlx::query!(
        "insert into entries (id, battle_id, status, reached) values ($1, $2, 'confirmed', $3::text::bracket_stage)",
        entry,
        battle,
        reached,
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query!(
        "insert into entry_members (entry_id, dancer_id) values ($1, $2)",
        entry,
        dancer
    )
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn events_split_upcoming_and_past_with_roles(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = sign_up(&app, "user@example.com").await;
    let id: Uuid = id_of(&create(&app, &cookie, dancer("Lil G", None)).await)
        .parse()
        .unwrap();

    let (_, upcoming_battle) = jam(&pool, "Soon", 10, "published").await;
    enter(&pool, upcoming_battle, id, "na").await;
    let (_, old_battle) = jam(&pool, "Old", -400, "completed").await;
    enter(&pool, old_battle, id, "winner").await;
    let (recent, _) = jam(&pool, "Recent", -30, "completed").await;
    sqlx::query!(
        "insert into event_staff (event_id, dancer_id, role) values ($1, $2, 'judge')",
        recent,
        id
    )
    .execute(&pool)
    .await
    .unwrap();
    let (_, draft_battle) = jam(&pool, "Secret", 20, "draft").await;
    enter(&pool, draft_battle, id, "na").await;

    let uri = format!("/api/dancers/{id}/events");
    let both = send(&app, get(&uri, None)).await;
    assert_eq!(both.status, StatusCode::OK);
    let upcoming = both.json["upcoming"].as_array().unwrap();
    assert_eq!(upcoming.len(), 1, "drafts are not shown");
    assert_eq!(upcoming[0]["event"]["name"], "Soon");
    assert_eq!(upcoming[0]["role"], "competitor");
    assert_eq!(upcoming[0]["battle"]["format"], "team");

    let past = both.json["past"].as_array().unwrap();
    assert_eq!(past[0]["event"]["name"], "Recent", "most recent first");
    assert_eq!(past[0]["role"], "judge");
    assert_eq!(past[0]["battle"], Value::Null);
    assert_eq!(past[1]["event"]["name"], "Old");
    assert_eq!(past[1]["reached"], "winner");

    let only_past = send(&app, get(&format!("{uri}?scope=past"), None)).await;
    assert!(only_past.json["upcoming"].as_array().unwrap().is_empty());
    assert_eq!(only_past.json["past"].as_array().unwrap().len(), 2);
}
