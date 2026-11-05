mod test_app;

use axum::{Router, http::StatusCode};
use breakingjam::{
    db,
    domain::dancer::{DancerFields, DancerSource},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, delete, get, id_of, post, put, send, set_role, sign_up};
use uuid::Uuid;

fn dancer(name: &str, handle: Option<&str>) -> Value {
    json!({
        "dancer_name": name,
        "aliases": [],
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

/// A new account that has registered a jam, so it may make pages for others.
async fn organizer(app: &Router, pool: &PgPool, email: &str) -> String {
    let cookie = sign_up(app, pool, email).await;
    set_role(pool, email, "organizer").await;
    cookie
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
    let user = sign_up(&app, &pool, "user@example.com").await;
    // A plain account makes only its own page; pages for others come with jams.
    let for_someone = create(&app, &user, dancer("Lil G", None)).await;
    assert_eq!(for_someone.status, StatusCode::FORBIDDEN);
    let created = send(
        &app,
        post(
            "/api/dancers/mine",
            dancer("Lil G", Some(" @Lil_G ")),
            Some(&user),
        ),
    )
    .await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.json["instagram_handle"], "lil_g");
    assert_eq!(created.json["source"], "self");
    assert_eq!(created.json["can_edit"], true);
    // `real_name` was dropped in M26: a legal name never reaches a public page.
    for hidden in ["notable", "user_id", "created_by", "real_name"] {
        assert!(
            created.json.get(hidden).is_none(),
            "{hidden} is never exposed"
        );
    }

    let organizer = organizer(&app, &pool, "org@example.com").await;
    let by_organizer = create(&app, &organizer, dancer("Ventus", None)).await;
    assert_eq!(by_organizer.json["source"], "organizer");

    let seeder = sign_up(&app, &pool, "seed@example.com").await;
    set_role(&pool, "seed@example.com", "seed_admin").await;
    let by_seeder = create(&app, &seeder, dancer("Atlas", None)).await;
    assert_eq!(by_seeder.json["source"], "seed");
}

#[sqlx::test]
async fn handle_is_unique_but_names_are_not(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = organizer(&app, &pool, "org@example.com").await;
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
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "user@example.com").await;
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
    let seeder = sign_up(&app, &pool, "seed@example.com").await;
    let user = organizer(&app, &pool, "org@example.com").await;

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
    let app = app(pool.clone());
    let creator = organizer(&app, &pool, "creator@example.com").await;
    let stranger = sign_up(&app, &pool, "stranger@example.com").await;
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
    let creator = organizer(&app, &pool, "creator@example.com").await;
    let owner = sign_up(&app, &pool, "owner@example.com").await;
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
    let organizer = organizer(&app, &pool, "org@example.com").await;
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
         values ($1, $2, $3, $4, $5::text::event_status,
                 (now() at time zone 'Europe/Paris')::date + $6::int,
                 (now() at time zone 'Europe/Paris')::date + $6::int, 'Europe/Paris', 'Paris', 'FR')",
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
        "insert into entries (id, battle_id, status, reached, final_rank)
         values ($1, $2, 'confirmed', $3::text::bracket_stage,
                 case $3 when 'winner' then 1 when 'top2' then 2 end)",
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
async fn events_split_live_upcoming_and_past_with_roles(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = organizer(&app, &pool, "org@example.com").await;
    let id: Uuid = id_of(&create(&app, &cookie, dancer("Lil G", None)).await)
        .parse()
        .unwrap();

    let (_, upcoming_battle) = jam(&pool, "Soon", 10, "published").await;
    enter(&pool, upcoming_battle, id, "na").await;
    let (_, today_battle) = jam(&pool, "Tonight", 0, "registration_closed").await;
    enter(&pool, today_battle, id, "na").await;
    let (_, old_battle) = jam(&pool, "Old", -400, "published").await;
    enter(&pool, old_battle, id, "winner").await;
    let (recent, _) = jam(&pool, "Recent", -30, "published").await;
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
    assert_eq!(upcoming[0]["event"]["phase"], "upcoming");
    let live = both.json["live"].as_array().unwrap();
    assert_eq!(live.len(), 1);
    assert_eq!(live[0]["event"]["name"], "Tonight");
    assert_eq!(live[0]["event"]["phase"], "live");

    let past = both.json["past"].as_array().unwrap();
    assert_eq!(past[0]["event"]["name"], "Recent", "most recent first");
    assert_eq!(past[0]["role"], "judge");
    assert_eq!(past[0]["battle"], Value::Null);
    assert_eq!(past[1]["event"]["name"], "Old");
    assert_eq!(past[1]["reached"], "winner");
    assert_eq!(past.len(), 2);
}

#[sqlx::test]
async fn a_deleted_dancer_stays_on_past_results_and_saves_but_joins_nothing_new(pool: PgPool) {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let admin = sign_up(&app, &pool, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "seed_admin").await;
    let jam = json!({ "name": "Paris Cypher", "starts_on": "2020-06-01", "ends_on": "2020-06-01",
                      "timezone": "Europe/Paris", "city": "Paris", "country": "FR" });
    let jam = id_of(&send(&app, post("/api/events", jam, Some(&owner))).await);
    let battle = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    let uri = format!("/api/events/{jam}/battles");
    let battle = id_of(&send(&app, post(&uri, battle, Some(&owner))).await);
    let gone = id_of(&create(&app, &owner, dancer("Gone", None)).await);
    let kept = id_of(&create(&app, &owner, dancer("Kept", None)).await);
    let entries = format!("/api/battles/{battle}/entries");
    let battles = format!("/api/events/{jam}/battles");
    let body = json!({ "dancer_ids": [gone], "status": "confirmed" });
    let entry = id_of(&send(&app, post(&entries, body.clone(), Some(&owner))).await);
    let staff_uri = format!("/api/events/{jam}/staff");
    let staff = json!([{ "dancer_id": gone, "role": "judge" }]);
    send(&app, put(&staff_uri, staff.clone(), Some(&owner))).await;
    let deleted = send(&app, delete(&format!("/api/dancers/{gone}"), Some(&admin))).await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);

    // Still named, marked so the page shows no link.
    let listed = send(&app, get(&battles, Some(&owner))).await;
    let members = &listed.json[0]["entries"][0]["members"];
    assert_eq!(members[0]["dancer_name"], "Gone");
    assert_eq!(members[0]["deleted"], true);
    let listed = send(&app, get(&staff_uri, Some(&owner))).await;
    assert_eq!(listed.json[0]["dancer"]["deleted"], true);

    // Saving what is already there works: the organiser can't be blocked by someone else's delete.
    let body = json!({ "dancer_ids": [gone], "status": "confirmed", "reached": "winner" });
    let saved = send(
        &app,
        put(&format!("/api/entries/{entry}"), body, Some(&owner)),
    )
    .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.json);
    let saved = send(&app, put(&staff_uri, staff, Some(&owner))).await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.json);

    // Nobody deleted joins anything new.
    let other = send(&app, post(&uri, json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18, "name": "Other" }), Some(&owner))).await;
    let other = format!("/api/battles/{}/entries", id_of(&other));
    let body = json!({ "dancer_ids": [gone], "status": "confirmed" });
    let joined = send(&app, post(&other, body, Some(&owner))).await;
    assert_eq!(joined.status, StatusCode::UNPROCESSABLE_ENTITY);
    let body = json!({ "dancer_ids": [kept], "status": "confirmed" });
    let second = id_of(&send(&app, post(&other, body, Some(&owner))).await);
    let body = json!({ "dancer_ids": [gone], "status": "confirmed" });
    let swapped = send(
        &app,
        put(&format!("/api/entries/{second}"), body, Some(&owner)),
    )
    .await;
    assert_eq!(swapped.status, StatusCode::UNPROCESSABLE_ENTITY);
}

/// What an approved claim (M7b) does: the account owns the page, now verified.
async fn verify(pool: &PgPool, dancer: &str, email: &str) {
    sqlx::query!(
        "update dancers set verified_at = now(),
           user_id = (select id from app_users where email = $2::text::citext)
         where id = $1::text::uuid",
        dancer,
        email
    )
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn an_account_makes_one_page_of_its_own_and_me_shows_it(pool: PgPool) {
    let app = app(pool.clone());
    let user = sign_up(&app, &pool, "nova@example.com").await;
    let me = |cookie: String| {
        let app = app.clone();
        async move { send(&app, get("/api/auth/me", Some(&cookie))).await.json }
    };
    assert_eq!(me(user.clone()).await["dancer"], Value::Null);

    let mine = |body: Value, cookie: &str| post("/api/dancers/mine", body, Some(cookie));
    let created = send(&app, mine(dancer("Nova", None), &user)).await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.json["source"], "self");
    assert_eq!(created.json["can_edit"], true);
    // What the dancer does comes with verification.
    assert_eq!(created.json["can_set_titles"], false);
    let id = id_of(&created);
    let page = me(user.clone()).await["dancer"].clone();
    assert_eq!(
        (&page["id"], &page["dancer_name"], &page["verified"]),
        (&json!(id), &json!("Nova"), &json!(false))
    );

    let again = send(&app, mine(dancer("Nova 2", None), &user)).await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    assert_eq!(
        again.json["error"]["message"],
        "this account already has a page"
    );
    // Two tabs at once get past that check together; the index still holds.
    let fields: DancerFields = serde_json::from_value(dancer("Nova 3", None)).unwrap();
    let user_id = sqlx::query_scalar!("select id from app_users where email = 'nova@example.com'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let raced = db::dancers::insert(&pool, &fields, DancerSource::SelfCreated, user_id).await;
    assert!(raced.is_err_and(|e| {
        e.as_database_error()
            .is_some_and(|d| d.is_unique_violation())
    }));
    let mut titled = dancer("Atlas", None);
    titled["titles"] = json!(["bboy"]);
    let other = sign_up(&app, &pool, "atlas@example.com").await;
    assert_eq!(
        send(&app, mine(titled, &other)).await.status,
        StatusCode::FORBIDDEN
    );
    // An organiser's own page is theirs too, not one made for a jam.
    let organizer = organizer(&app, &pool, "org@example.com").await;
    let theirs = send(&app, mine(dancer("Ventus", None), &organizer)).await;
    assert_eq!(theirs.json["source"], "self");

    // Its maker edits it like any unverified page: every change kept in `dancer_edits`.
    let uri = format!("/api/dancers/{id}");
    let edited = send(&app, put(&uri, dancer("Nova B", None), Some(&user))).await;
    assert_eq!(edited.status, StatusCode::OK);
    let logged = sqlx::query_scalar!(
        r#"select count(*) as "count!" from dancer_edits
           where dancer_id = $1::text::uuid and field = 'dancer_name'"#,
        id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(logged, 1);

    // Merged into the page an organiser made for the same dancer, it follows the merge.
    let survivor = id_of(&create(&app, &organizer, dancer("Nova", Some("nova"))).await);
    let admin = sign_up(&app, &pool, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let uri = format!("/api/admin/dancers/{id}/merge");
    let merged = send(&app, post(&uri, json!({ "into": survivor }), Some(&admin))).await;
    assert_eq!(merged.status, StatusCode::OK);
    assert_eq!(me(user.clone()).await["dancer"]["id"], json!(survivor));
    // The merged page still counts: no fresh duplicate.
    let after_merge = send(&app, mine(dancer("Nova", None), &user)).await;
    assert_eq!(after_merge.status, StatusCode::CONFLICT);

    // Verified, it says so; a page someone else owns is never "mine".
    verify(&pool, &survivor, "nova@example.com").await;
    assert_eq!(me(user.clone()).await["dancer"]["verified"], true);
    sqlx::query!(
        "update dancers set user_id = (select id from app_users where email = 'atlas@example.com')
         where id = $1::text::uuid",
        survivor
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(me(user.clone()).await["dancer"], Value::Null);
    // With no page left, the account may make one again: never stuck between the two rules.
    let fresh = send(&app, mine(dancer("Nova", None), &user)).await;
    assert_eq!(fresh.status, StatusCode::CREATED);
    assert_eq!(me(user.clone()).await["dancer"]["id"], json!(id_of(&fresh)));

    // The same when someone else's claim on the page it made is approved.
    let fresh = id_of(&fresh);
    sign_up(&app, &pool, "rival@example.com").await;
    verify(&pool, &fresh, "rival@example.com").await;
    assert_eq!(me(user.clone()).await["dancer"], Value::Null);
    let again = send(&app, mine(dancer("Nova", None), &user)).await;
    assert_eq!(again.status, StatusCode::CREATED);
}

#[sqlx::test]
async fn titles_are_set_by_the_verified_owner_or_the_team_only(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = organizer(&app, &pool, "org@example.com").await;
    let owner = sign_up(&app, &pool, "owner@example.com").await;
    let seeder = sign_up(&app, &pool, "seed@example.com").await;
    set_role(&pool, "seed@example.com", "seed_admin").await;
    let with_titles = |name: &str, titles: Value| {
        let mut body = dancer(name, None);
        body["titles"] = titles;
        body
    };

    // An organiser makes the page, but doesn't say what its dancer does.
    let refused = create(&app, &organizer, with_titles("Lil G", json!(["bboy"]))).await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    let id = id_of(&create(&app, &organizer, dancer("Lil G", None)).await);
    let uri = format!("/api/dancers/{id}");
    let page = send(&app, get(&uri, Some(&organizer))).await.json;
    assert_eq!(
        (&page["titles"], &page["can_set_titles"]),
        (&json!([]), &json!(false))
    );
    let by_creator = send(
        &app,
        put(&uri, with_titles("Lil G", json!(["dj"])), Some(&organizer)),
    )
    .await;
    assert_eq!(by_creator.status, StatusCode::FORBIDDEN);

    // Its verified owner does: in the fixed order, without repeats.
    verify(&pool, &id, "owner@example.com").await;
    assert_eq!(
        send(&app, get(&uri, Some(&owner))).await.json["can_set_titles"],
        true
    );
    let titles = json!(["dj", "bgirl", "dj"]);
    let set = send(&app, put(&uri, with_titles("Lil G", titles), Some(&owner))).await;
    assert_eq!(set.status, StatusCode::OK);
    assert_eq!(set.json["titles"], json!(["bgirl", "dj"]));
    // A save without titles keeps them.
    let kept = send(&app, put(&uri, dancer("Lil G.", None), Some(&owner))).await;
    assert_eq!(kept.json["titles"], json!(["bgirl", "dj"]));

    // The BreakingJam team may, on any page; a merge gives them to a survivor that has none.
    let seeded = create(
        &app,
        &seeder,
        with_titles("Hong 10", json!(["breaker", "judge"])),
    )
    .await;
    assert_eq!(seeded.json["titles"], json!(["breaker", "judge"]));
    let survivor = id_of(&create(&app, &organizer, dancer("Hong10", None)).await);
    let admin = sign_up(&app, &pool, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let merge = format!("/api/admin/dancers/{}/merge", id_of(&seeded));
    send(
        &app,
        post(&merge, json!({ "into": survivor }), Some(&admin)),
    )
    .await;
    let merged = send(&app, get(&format!("/api/dancers/{survivor}"), None)).await;
    assert_eq!(merged.json["titles"], json!(["breaker", "judge"]));

    // A survivor with an owner keeps the titles its owner chose, none included.
    let titled = create(&app, &seeder, with_titles("B-Boy X", json!(["mc"]))).await;
    let owned = id_of(&create(&app, &organizer, dancer("Bboy X", None)).await);
    verify(&pool, &owned, "seed@example.com").await;
    let merge = format!("/api/admin/dancers/{}/merge", id_of(&titled));
    send(&app, post(&merge, json!({ "into": owned }), Some(&admin))).await;
    let kept = send(&app, get(&format!("/api/dancers/{owned}"), None)).await;
    assert_eq!(kept.json["titles"], json!([]));
}
