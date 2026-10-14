//! M7b: claims, admin review, edit log, merge, role changes.
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, get, post, put, send, set_role, sign_up};
use uuid::Uuid;

struct World {
    app: Router,
    pool: PgPool,
    admin: String,
    organizer: String,
}

async fn world(pool: PgPool) -> World {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let organizer = sign_up(&app, "org@example.com").await;
    set_role(&pool, "org@example.com", "organizer").await;
    World {
        app,
        pool,
        admin,
        organizer,
    }
}

impl World {
    async fn dancer(&self, name: &str, handle: Option<&str>) -> String {
        let body = json!({ "dancer_name": name, "country": "FR", "instagram_handle": handle });
        let response = send(&self.app, post("/api/dancers", body, Some(&self.organizer))).await;
        assert_eq!(response.status, StatusCode::CREATED);
        response.json["id"].as_str().unwrap().to_owned()
    }

    async fn claim(&self, dancer: &str, cookie: &str) -> TestResponse {
        let uri = format!("/api/dancers/{dancer}/claim");
        send(&self.app, post(&uri, json!({}), Some(cookie))).await
    }

    async fn review(&self, claim: &Value, action: &str) -> TestResponse {
        let uri = format!(
            "/api/admin/claims/{}/{action}",
            claim["id"].as_str().unwrap()
        );
        send(&self.app, post(&uri, json!({}), Some(&self.admin))).await
    }
}

#[sqlx::test]
async fn claim_then_approve_hands_the_page_over(pool: PgPool) {
    let w = world(pool).await;
    let dancer = w.dancer("Lil G", Some("lilg")).await;
    let lilg = sign_up(&w.app, "lilg@example.com").await;
    let rival = sign_up(&w.app, "rival@example.com").await;

    let claim = w.claim(&dancer, &lilg).await;
    assert_eq!(claim.status, StatusCode::OK);
    assert_eq!(claim.json["status"], "pending");
    let code = claim.json["code"].as_str().unwrap();
    assert!(code.starts_with("BJ-") && code.len() == 7);
    let again = w.claim(&dancer, &lilg).await;
    assert_eq!(
        again.json["code"], code,
        "one pending claim per dancer and user"
    );
    let rival_claim = w.claim(&dancer, &rival).await.json;

    let mine = send(
        &w.app,
        get(&format!("/api/dancers/{dancer}/claim"), Some(&lilg)),
    )
    .await;
    assert_eq!(mine.json["code"], code);

    let as_user = send(&w.app, get("/api/admin/claims", Some(&lilg))).await;
    assert_eq!(as_user.status, StatusCode::FORBIDDEN);
    let queue = send(&w.app, get("/api/admin/claims", Some(&w.admin))).await;
    let items = queue.json["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["code"], code);
    assert_eq!(items[0]["dancer"]["instagram_handle"], "lilg");
    assert_eq!(items[0]["user"]["email"], "lilg@example.com");

    let approved = w.review(&claim.json, "approve").await;
    assert_eq!(approved.status, StatusCode::OK);
    assert_eq!(approved.json["status"], "approved");
    let rival_after = send(
        &w.app,
        get(&format!("/api/dancers/{dancer}/claim"), Some(&rival)),
    )
    .await;
    assert_eq!(
        rival_after.json["status"], "rejected",
        "competing claims are rejected"
    );
    assert_eq!(
        w.review(&rival_claim, "approve").await.status,
        StatusCode::CONFLICT
    );

    let page = send(&w.app, get(&format!("/api/dancers/{dancer}"), Some(&lilg))).await;
    assert!(page.json["verified_at"].is_string());
    assert_eq!(page.json["can_edit"], true);
    let by_creator = send(
        &w.app,
        get(&format!("/api/dancers/{dancer}"), Some(&w.organizer)),
    )
    .await;
    assert_eq!(by_creator.json["can_edit"], false);

    assert_eq!(w.claim(&dancer, &rival).await.status, StatusCode::CONFLICT);
    let other = w.dancer("Somebody", None).await;
    let second_page = w.claim(&other, &lilg).await;
    assert_eq!(
        second_page.status,
        StatusCode::CONFLICT,
        "one page per account"
    );
}

#[sqlx::test]
async fn rejected_claims_can_be_retried(pool: PgPool) {
    let w = world(pool).await;
    let dancer = w.dancer("Lil G", None).await;
    let lilg = sign_up(&w.app, "lilg@example.com").await;
    let first = w.claim(&dancer, &lilg).await.json;

    assert_eq!(w.review(&first, "reject").await.json["status"], "rejected");
    let retry = w.claim(&dancer, &lilg).await;
    assert_eq!(retry.json["status"], "pending");
    assert_ne!(retry.json["id"], first["id"]);
}

#[sqlx::test]
async fn edits_to_unverified_dancers_are_logged(pool: PgPool) {
    let w = world(pool).await;
    let dancer = w.dancer("Lil G", None).await;
    let uri = format!("/api/dancers/{dancer}");
    let body = json!({ "dancer_name": "Lil G", "country": "FR", "city": "Lyon",
                       "instagram_handle": "@LilG", "aliases": ["G"] });
    assert_eq!(
        send(&w.app, put(&uri, body, Some(&w.organizer)))
            .await
            .status,
        StatusCode::OK
    );

    let id: Uuid = dancer.parse().unwrap();
    let edits = sqlx::query!(
        "select field, old_value, new_value from dancer_edits where dancer_id = $1 order by field",
        id
    )
    .fetch_all(&w.pool)
    .await
    .unwrap();
    let logged: Vec<(&str, Option<&str>, Option<&str>)> = edits
        .iter()
        .map(|e| {
            (
                e.field.as_str(),
                e.old_value.as_deref(),
                e.new_value.as_deref(),
            )
        })
        .collect();
    assert_eq!(
        logged,
        [
            ("aliases", None, Some("G")),
            ("city", None, Some("Lyon")),
            ("instagram_handle", None, Some("lilg")),
        ]
    );

    // Verified pages are their owner's; their edits are not logged.
    sqlx::query!("update dancers set verified_at = now() where id = $1", id)
        .execute(&w.pool)
        .await
        .unwrap();
    let seed = sign_up(&w.app, "seed@example.com").await;
    set_role(&w.pool, "seed@example.com", "seed_admin").await;
    let body = json!({ "dancer_name": "Lil G", "country": "BE" });
    send(&w.app, put(&uri, body, Some(&seed))).await;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "n!" from dancer_edits where dancer_id = $1"#,
        id
    )
    .fetch_one(&w.pool)
    .await
    .unwrap();
    assert_eq!(count, 3);
}

/// A published jam with one 1v1 battle; returns (event id, battle id).
async fn jam(w: &World) -> (String, String) {
    let body = json!({ "name": "Jam", "starts_on": "2030-06-01", "ends_on": "2030-06-01",
                       "timezone": "Europe/Paris", "city": "Paris", "country": "FR" });
    let event = send(&w.app, post("/api/events", body, Some(&w.organizer)))
        .await
        .json["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let battle = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    let battle = send(
        &w.app,
        post(
            &format!("/api/events/{event}/battles"),
            battle,
            Some(&w.organizer),
        ),
    )
    .await
    .json["id"]
        .as_str()
        .unwrap()
        .to_owned();
    send(
        &w.app,
        post(
            &format!("/api/events/{event}/publish"),
            json!({}),
            Some(&w.organizer),
        ),
    )
    .await;
    (event, battle)
}

#[sqlx::test]
async fn merge_moves_everything_and_leaves_a_redirect(pool: PgPool) {
    let w = world(pool).await;
    let survivor = w.dancer("Kid Rocket", None).await;
    let loser = w.dancer("Kid Rockett", Some("kidrocket")).await;
    let (event, battle) = jam(&w).await;
    send(
        &w.app,
        post(
            &format!("/api/battles/{battle}/entries"),
            json!({ "dancer_ids": [loser] }),
            Some(&w.organizer),
        ),
    )
    .await;
    let staff = json!([{ "dancer_id": loser, "role": "judge" }, { "dancer_id": survivor, "role": "judge" }]);
    send(
        &w.app,
        put(
            &format!("/api/events/{event}/staff"),
            staff,
            Some(&w.organizer),
        ),
    )
    .await;
    let crew = send(
        &w.app,
        post(
            "/api/crews",
            json!({ "name": "Floor Lords" }),
            Some(&w.organizer),
        ),
    )
    .await
    .json["id"]
        .as_str()
        .unwrap()
        .to_owned();
    send(
        &w.app,
        post(
            &format!("/api/crews/{crew}/members"),
            json!({ "dancer_id": loser }),
            Some(&w.organizer),
        ),
    )
    .await;

    let uri = format!("/api/admin/dancers/{loser}/merge");
    let by_organizer = send(
        &w.app,
        post(&uri, json!({ "into": survivor }), Some(&w.organizer)),
    )
    .await;
    assert_eq!(by_organizer.status, StatusCode::FORBIDDEN);
    let into_self = send(&w.app, post(&uri, json!({ "into": loser }), Some(&w.admin))).await;
    assert_eq!(into_self.status, StatusCode::UNPROCESSABLE_ENTITY);

    let merged = send(
        &w.app,
        post(&uri, json!({ "into": survivor }), Some(&w.admin)),
    )
    .await;
    assert_eq!(merged.status, StatusCode::OK);
    assert_eq!(merged.json["aliases"], json!(["Kid Rockett"]));
    assert_eq!(merged.json["instagram_handle"], "kidrocket");

    let redirect = send(&w.app, get(&format!("/api/dancers/{loser}"), None)).await;
    assert_eq!(redirect.json, json!({ "merged_into": survivor }));

    let page = send(&w.app, get(&format!("/api/dancers/{survivor}"), None)).await;
    assert_eq!(page.json["instagram_handle"], "kidrocket", "handle adopted");
    assert_eq!(page.json["crews"][0]["name"], "Floor Lords");
    let events = send(
        &w.app,
        get(&format!("/api/dancers/{survivor}/events"), None),
    )
    .await;
    let roles: Vec<&str> = events.json["upcoming"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["role"].as_str().unwrap())
        .collect();
    assert_eq!(
        roles.len(),
        2,
        "the entry moved; the duplicate judge row collapsed"
    );
    assert!(roles.contains(&"competitor") && roles.contains(&"judge"));

    let search = send(&w.app, get("/api/dancers?q=kid", None)).await;
    assert_eq!(search.json["items"].as_array().unwrap().len(), 1);
    let edit_loser = send(
        &w.app,
        put(
            &format!("/api/dancers/{loser}"),
            json!({ "dancer_name": "X", "country": "FR" }),
            Some(&w.organizer),
        ),
    )
    .await;
    assert_eq!(edit_loser.status, StatusCode::NOT_FOUND);
    let again = send(
        &w.app,
        post(&uri, json!({ "into": survivor }), Some(&w.admin)),
    )
    .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
}

#[sqlx::test]
async fn verified_dancers_cannot_be_merged_away(pool: PgPool) {
    let w = world(pool).await;
    let verified = w.dancer("Lil G", None).await;
    let other = w.dancer("Lil G.", None).await;
    let id: Uuid = verified.parse().unwrap();
    sqlx::query!("update dancers set verified_at = now() where id = $1", id)
        .execute(&w.pool)
        .await
        .unwrap();

    let uri = format!("/api/admin/dancers/{verified}/merge");
    let response = send(&w.app, post(&uri, json!({ "into": other }), Some(&w.admin))).await;
    assert_eq!(response.status, StatusCode::CONFLICT);

    let reverse = format!("/api/admin/dancers/{other}/merge");
    let response = send(
        &w.app,
        post(&reverse, json!({ "into": verified }), Some(&w.admin)),
    )
    .await;
    assert_eq!(response.status, StatusCode::OK);
}

#[sqlx::test]
async fn admins_change_roles_but_not_their_own(pool: PgPool) {
    let w = world(pool).await;
    sign_up(&w.app, "user@example.com").await;
    let user_id = sqlx::query_scalar!("select id from app_users where email = 'user@example.com'")
        .fetch_one(&w.pool)
        .await
        .unwrap();
    let admin_id =
        sqlx::query_scalar!("select id from app_users where email = 'admin@example.com'")
            .fetch_one(&w.pool)
            .await
            .unwrap();

    let promoted = send(
        &w.app,
        put(
            &format!("/api/admin/users/{user_id}/role"),
            json!({ "role": "seed_admin" }),
            Some(&w.admin),
        ),
    )
    .await;
    assert_eq!(promoted.status, StatusCode::OK);
    assert_eq!(promoted.json["role"], "seed_admin");

    let own = send(
        &w.app,
        put(
            &format!("/api/admin/users/{admin_id}/role"),
            json!({ "role": "user" }),
            Some(&w.admin),
        ),
    )
    .await;
    assert_eq!(own.status, StatusCode::UNPROCESSABLE_ENTITY);

    let by_organizer = send(
        &w.app,
        put(
            &format!("/api/admin/users/{user_id}/role"),
            json!({ "role": "admin" }),
            Some(&w.organizer),
        ),
    )
    .await;
    assert_eq!(by_organizer.status, StatusCode::FORBIDDEN);
}
