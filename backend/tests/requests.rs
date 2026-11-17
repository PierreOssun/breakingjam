//! Asking to enter a battle "with approval", and its organiser answering (M32).
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{app, delete, get, id_of, post, publish, put, send, set_role, sign_up};

fn battle(team_size: i16, max: i32) -> Value {
    json!({ "format": "team", "team_size": team_size, "gender": "mixed", "age": "adult",
            "age_min": 18, "max_entries": max, "registration": "approval" })
}

/// A published jam still to come with one battle; returns `(jam, battle)`.
async fn jam_with(app: &Router, pool: &PgPool, organiser: &str, battle: Value) -> (String, String) {
    let body = json!({ "name": "Winter Cypher", "starts_on": "2030-12-12",
                       "ends_on": "2030-12-12", "timezone": "Europe/Zurich" });
    let jam = id_of(&send(app, post("/api/events", body, Some(organiser))).await);
    let added = send(
        app,
        post(
            &format!("/api/events/{jam}/battles"),
            battle,
            Some(organiser),
        ),
    )
    .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.json);
    publish(pool, &jam).await;
    (jam, id_of(&added))
}

/// Signs `email` up with a verified page whose handle is hidden; returns its cookie and page.
async fn verified(app: &Router, pool: &PgPool, email: &str) -> (String, String) {
    let cookie = sign_up(app, pool, email).await;
    let name = email.split('@').next().unwrap();
    let body = json!({ "dancer_name": name, "country": "CH", "instagram_handle": name });
    let page = id_of(&send(app, post("/api/dancers/mine", body, Some(&cookie))).await);
    sqlx::query!(
        "update dancers set verified_at = now(), instagram_hidden = true,
           user_id = (select id from app_users where email = $1::text::citext)
         where id = $2::text::uuid",
        email,
        page,
    )
    .execute(pool)
    .await
    .unwrap();
    (cookie, page)
}

#[sqlx::test]
async fn with_approval_needs_a_battle_of_fixed_size(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, _) = jam_with(&app, &pool, &organiser, battle(2, 16)).await;
    let any_size = json!({ "format": "showcase", "gender": "mixed", "age": "adult",
                           "age_min": 18, "registration": "approval" });
    let refused = send(
        &app,
        post(
            &format!("/api/events/{jam}/battles"),
            any_size,
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "registration");
}

#[sqlx::test]
async fn a_request_stays_private_until_the_organiser_accepts_it(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(1, 16)).await;
    let ask = format!("/api/battles/{battle_id}/requests");

    let unverified = sign_up(&app, &pool, "fake@example.com").await;
    let refused = send(&app, post(&ask, json!({}), Some(&unverified))).await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);

    let (nova, page) = verified(&app, &pool, "nova@example.com").await;
    let asked = send(&app, post(&ask, json!({}), Some(&nova))).await;
    assert_eq!(asked.status, StatusCode::CREATED, "{}", asked.json);
    assert_eq!(asked.json["status"], "pending");
    let twice = send(&app, post(&ask, json!({}), Some(&nova))).await;
    assert_eq!(twice.json["error"]["code"], "already_requested");

    // Not in the battle, for anyone; the asker sees it waiting.
    let battles = send(&app, get(&format!("/api/events/{jam}/battles"), None)).await;
    assert_eq!(battles.json[0]["entries"], json!([]));
    let mine = send(
        &app,
        get(&format!("/api/events/{jam}/requests/mine"), Some(&nova)),
    )
    .await;
    assert_eq!(mine.json[0]["status"], "pending");

    // The organiser sees the handle the page hides, and that it hides it.
    let list = send(
        &app,
        get(&format!("/api/events/{jam}/requests"), Some(&organiser)),
    )
    .await;
    let member = &list.json[0]["members"][0];
    assert_eq!(
        (&member["id"], &member["instagram_handle"]),
        (&json!(page), &json!("nova"))
    );
    assert_eq!(
        (&member["instagram_hidden"], &member["verified"]),
        (&json!(true), &json!(true))
    );
    let public = send(&app, get(&format!("/api/dancers/{page}"), None)).await;
    assert_eq!(public.json["instagram_handle"], json!(null));
    // Nobody else sees the queue.
    let other = send(
        &app,
        get(&format!("/api/events/{jam}/requests"), Some(&nova)),
    )
    .await;
    assert_eq!(other.status, StatusCode::FORBIDDEN);

    let request = list.json[0]["id"].as_str().unwrap();
    let accepted = send(
        &app,
        post(
            &format!("/api/requests/{request}/accept"),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(accepted.status, StatusCode::OK, "{}", accepted.json);
    assert_eq!(accepted.json["status"], "confirmed");
    let again = send(
        &app,
        post(
            &format!("/api/requests/{request}/accept"),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    let mine = send(
        &app,
        get(&format!("/api/events/{jam}/requests/mine"), Some(&nova)),
    )
    .await;
    assert_eq!(mine.json[0]["status"], "approved");
    let shown = send(&app, get(&format!("/api/events/{jam}"), Some(&nova))).await;
    assert_eq!(shown.json["going"], true);
    let battles = send(&app, get(&format!("/api/events/{jam}/battles"), None)).await;
    assert_eq!(
        battles.json[0]["entries"][0]["members"][0]["id"],
        json!(page)
    );
}

#[sqlx::test]
async fn a_declined_dancer_may_ask_again_and_a_waiting_one_may_cancel(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(1, 16)).await;
    let ask = format!("/api/battles/{battle_id}/requests");
    let (nova, _) = verified(&app, &pool, "nova@example.com").await;
    // A solo battle takes no team name: it would head the organiser's email.
    let named = json!({ "team_name": "Verify your account at example.com" });
    let refused = send(&app, post(&ask, named, Some(&nova))).await;
    assert_eq!(refused.json["error"]["fields"][0]["field"], "team_name");
    let first = id_of(&send(&app, post(&ask, json!({}), Some(&nova))).await);

    let declined = send(
        &app,
        post(
            &format!("/api/requests/{first}/decline"),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(declined.status, StatusCode::NO_CONTENT);
    let mine = send(
        &app,
        get(&format!("/api/events/{jam}/requests/mine"), Some(&nova)),
    )
    .await;
    assert_eq!(mine.json[0]["status"], "rejected");
    let battles = send(&app, get(&format!("/api/events/{jam}/battles"), None)).await;
    assert_eq!(battles.json[0]["entries"], json!([]));

    let second = id_of(&send(&app, post(&ask, json!({}), Some(&nova))).await);
    // Only its asker takes it back.
    let (zed, _) = verified(&app, &pool, "zed@example.com").await;
    let not_theirs = send(&app, delete(&format!("/api/requests/{second}"), Some(&zed))).await;
    assert_eq!(not_theirs.status, StatusCode::NOT_FOUND);
    let cancelled = send(
        &app,
        delete(&format!("/api/requests/{second}"), Some(&nova)),
    )
    .await;
    assert_eq!(cancelled.status, StatusCode::NO_CONTENT);
    let queue = send(
        &app,
        get(&format!("/api/events/{jam}/requests"), Some(&organiser)),
    )
    .await;
    assert_eq!(queue.json, json!([]));
}

#[sqlx::test]
async fn a_captain_asks_with_a_full_team(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(2, 16)).await;
    let ask = format!("/api/battles/{battle_id}/requests");
    let (nova, page) = verified(&app, &pool, "nova@example.com").await;

    let alone = send(&app, post(&ask, json!({ "team_name": "Duo" }), Some(&nova))).await;
    assert_eq!(alone.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(alone.json["error"]["fields"][0]["field"], "teammates");

    // A teammate who isn't on BreakingJam yet gets a page from the captain.
    let body = json!({ "dancer_name": "Lumen", "country": "CH" });
    let teammate = send(&app, post("/api/dancers", body, Some(&nova))).await;
    assert_eq!(teammate.status, StatusCode::CREATED, "{}", teammate.json);
    let teammate = id_of(&teammate);
    let body = json!({ "team_name": "Duo\nSubject: hi", "teammates": [teammate] });
    let refused = send(&app, post(&ask, body, Some(&nova))).await;
    assert_eq!(refused.json["error"]["fields"][0]["field"], "team_name");
    let body = json!({ "team_name": "Duo", "teammates": [teammate] });
    assert_eq!(
        send(&app, post(&ask, body, Some(&nova))).await.status,
        StatusCode::CREATED
    );

    let list = send(
        &app,
        get(&format!("/api/events/{jam}/requests"), Some(&organiser)),
    )
    .await;
    assert_eq!(list.json[0]["team_name"], "Duo");
    let members: Vec<_> = list.json[0]["members"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| &m["id"])
        .collect();
    assert_eq!(members, [&json!(page), &json!(teammate)]);
    let request = list.json[0]["id"].as_str().unwrap();
    let entry = send(
        &app,
        post(
            &format!("/api/requests/{request}/accept"),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(entry.status, StatusCode::OK, "{}", entry.json);
    assert_eq!(entry.json["team_name"], "Duo");
    assert_eq!(entry.json["members"].as_array().unwrap().len(), 2);

    // Without a verified page, no page for someone else.
    let plain = sign_up(&app, &pool, "plain@example.com").await;
    let body = json!({ "dancer_name": "Ghost", "country": "CH" });
    assert_eq!(
        send(&app, post("/api/dancers", body, Some(&plain)))
            .await
            .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test]
async fn a_teammate_merged_away_is_followed_to_the_surviving_page(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(2, 16)).await;
    let (nova, _) = verified(&app, &pool, "nova@example.com").await;
    let page = |name: &str| {
        post(
            "/api/dancers",
            json!({ "dancer_name": name, "country": "CH" }),
            Some(&nova),
        )
    };
    let lumen = id_of(&send(&app, page("Lumen")).await);
    let survivor = id_of(&send(&app, page("Lumen B")).await);
    let body = json!({ "team_name": "Duo", "teammates": [lumen] });
    let ask = format!("/api/battles/{battle_id}/requests");
    assert_eq!(
        send(&app, post(&ask, body, Some(&nova))).await.status,
        StatusCode::CREATED
    );

    let admin = sign_up(&app, &pool, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let merge = format!("/api/admin/dancers/{lumen}/merge");
    let merged = send(
        &app,
        post(&merge, json!({ "into": survivor }), Some(&admin)),
    )
    .await;
    assert_eq!(merged.status, StatusCode::OK, "{}", merged.json);

    let list = send(
        &app,
        get(&format!("/api/events/{jam}/requests"), Some(&organiser)),
    )
    .await;
    assert_eq!(list.json[0]["members"][1]["id"], json!(survivor));
    let request = list.json[0]["id"].as_str().unwrap();
    let accept = format!("/api/requests/{request}/accept");
    let entry = send(&app, post(&accept, json!({}), Some(&organiser))).await;
    assert_eq!(entry.status, StatusCode::OK, "{}", entry.json);
}

#[sqlx::test]
async fn a_full_battle_takes_no_more(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(1, 1)).await;
    let ask = format!("/api/battles/{battle_id}/requests");
    let (nova, _) = verified(&app, &pool, "nova@example.com").await;
    let (zed, _) = verified(&app, &pool, "zed@example.com").await;
    send(&app, post(&ask, json!({}), Some(&nova))).await;
    send(&app, post(&ask, json!({}), Some(&zed))).await;

    let list = send(
        &app,
        get(&format!("/api/events/{jam}/requests"), Some(&organiser)),
    )
    .await;
    let ids: Vec<_> = list
        .json
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["id"].as_str().unwrap().to_owned())
        .collect();
    let waiting = send(&app, get("/api/requests/waiting", Some(&organiser))).await;
    assert_eq!(waiting.json[0]["count"], 2);

    let first = send(
        &app,
        post(
            &format!("/api/requests/{}/accept", ids[0]),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(first.status, StatusCode::OK);
    let second = send(
        &app,
        post(
            &format!("/api/requests/{}/accept", ids[1]),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(second.json["error"]["code"], "battle_full");
    let (late, _) = verified(&app, &pool, "late@example.com").await;
    let refused = send(&app, post(&ask, json!({}), Some(&late))).await;
    assert_eq!(refused.json["error"]["code"], "battle_full");

    // Only a battle "with approval" takes requests.
    let open = json!({ "format": "team", "team_size": 1, "gender": "mixed", "age": "adult",
                       "age_min": 18, "registration": "open" });
    send(
        &app,
        put(&format!("/api/battles/{battle_id}"), open, Some(&organiser)),
    )
    .await;
    let not_now = send(&app, post(&ask, json!({}), Some(&late))).await;
    assert_eq!(not_now.status, StatusCode::CONFLICT);

    // Once the jam is over, the request left waiting lapses: the menu stops counting it.
    let waiting = send(&app, get("/api/requests/waiting", Some(&organiser))).await;
    assert_eq!(waiting.json[0]["count"], 1);
    sqlx::query!(
        "update events set starts_on = '2020-01-04', ends_on = '2020-01-04' where id = $1::text::uuid",
        jam
    )
    .execute(&pool)
    .await
    .unwrap();
    let waiting = send(&app, get("/api/requests/waiting", Some(&organiser))).await;
    assert_eq!(waiting.json, json!([]));
}
