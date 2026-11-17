//! Who can enter a battle, and verified dancers entering open ones themselves (M32).
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{app, delete, get, id_of, post, publish, put, send, sign_up};

fn battle(team_size: i16, registration: &str) -> Value {
    json!({ "format": "team", "team_size": team_size, "gender": "mixed", "age": "adult",
            "age_min": 18, "max_entries": 2, "registration": registration })
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

/// Signs `email` up with a verified page of its own; returns its cookie and the page's id.
async fn verified(app: &Router, pool: &PgPool, email: &str) -> (String, String) {
    let cookie = sign_up(app, pool, email).await;
    let name = email.split('@').next().unwrap();
    let body = json!({ "dancer_name": name, "country": "CH" });
    let page = id_of(&send(app, post("/api/dancers/mine", body, Some(&cookie))).await);
    sqlx::query!(
        "update dancers set verified_at = now(),
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

async fn set_jam(pool: &PgPool, jam: &str, change: &str) {
    match change {
        "closed" => sqlx::query!(
            "update events set status = 'registration_closed' where id = $1::text::uuid",
            jam
        ),
        _ => sqlx::query!(
            "update events set starts_on = current_date, ends_on = current_date + 1
             where id = $1::text::uuid",
            jam
        ),
    }
    .execute(pool)
    .await
    .unwrap();
}

#[sqlx::test]
async fn open_is_for_solo_battles(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, solo) = jam_with(&app, &pool, &organiser, battle(1, "open")).await;
    let battles = send(&app, get(&format!("/api/events/{jam}/battles"), None)).await;
    assert_eq!(battles.json[0]["registration"], "open");

    let uri = format!("/api/events/{jam}/battles");
    let refused = send(&app, post(&uri, battle(2, "open"), Some(&organiser))).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "registration");
    assert_eq!(
        refused.json["error"]["fields"][0]["message"],
        "open is for solo battles"
    );
    // A team asks instead (tests/requests.rs).
    let team = send(&app, post(&uri, battle(2, "approval"), Some(&organiser))).await;
    assert_eq!(team.status, StatusCode::CREATED, "{}", team.json);
    // Seven to smoke is solo too; a battle saved without the field is the organiser's.
    let smoke = json!({ "format": "seven_to_smoke", "gender": "mixed", "age": "adult",
                        "age_min": 18, "registration": "open" });
    let saved = send(
        &app,
        put(&format!("/api/battles/{solo}"), smoke, Some(&organiser)),
    )
    .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.json);
    let plain = json!({ "format": "team", "team_size": 1, "gender": "mixed", "age": "adult",
                        "age_min": 18 });
    let saved = send(
        &app,
        put(&format!("/api/battles/{solo}"), plain, Some(&organiser)),
    )
    .await;
    assert_eq!(saved.json["registration"], "organizer");
}

#[sqlx::test]
async fn a_verified_dancer_enters_once_until_the_battle_is_full(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(1, "open")).await;
    let enter = format!("/api/battles/{battle_id}/enter");

    // An account without a verified page can't.
    let unverified = sign_up(&app, &pool, "fake@example.com").await;
    let refused = send(&app, post(&enter, json!({}), Some(&unverified))).await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);

    let (nova, page) = verified(&app, &pool, "nova@example.com").await;
    let entered = send(&app, post(&enter, json!({}), Some(&nova))).await;
    assert_eq!(entered.status, StatusCode::CREATED, "{}", entered.json);
    assert_eq!(entered.json["status"], "confirmed");
    assert_eq!(entered.json["members"][0]["id"], json!(page));
    // Entering says you're going; the jam says it takes both.
    let shown = send(&app, get(&format!("/api/events/{jam}"), Some(&nova))).await;
    assert_eq!(
        (&shown.json["going"], &shown.json["going_count"]),
        (&json!(true), &json!(1))
    );
    assert_eq!(shown.json["takes_entries"], true);
    assert_eq!(shown.json["takes_attendees"], true);

    let twice = send(&app, post(&enter, json!({}), Some(&nova))).await;
    assert_eq!(twice.status, StatusCode::CONFLICT);
    // A code of its own, so the page can tell a double tap from a refusal.
    assert_eq!(twice.json["error"]["code"], "already_entered");
    let (zed, _) = verified(&app, &pool, "zed@example.com").await;
    assert_eq!(
        send(&app, post(&enter, json!({}), Some(&zed))).await.status,
        StatusCode::CREATED
    );
    // Two places, two dancers.
    let (late, _) = verified(&app, &pool, "late@example.com").await;
    let full = send(&app, post(&enter, json!({}), Some(&late))).await;
    assert_eq!(full.status, StatusCode::CONFLICT);
    assert_eq!(full.json["error"]["code"], "battle_full");
}

#[sqlx::test]
async fn only_an_open_battle_of_a_jam_still_taking_dancers(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (nova, _) = verified(&app, &pool, "nova@example.com").await;
    let (_, by_hand) = jam_with(&app, &pool, &organiser, battle(1, "organizer")).await;
    let refused = send(
        &app,
        post(
            &format!("/api/battles/{by_hand}/enter"),
            json!({}),
            Some(&nova),
        ),
    )
    .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);

    for change in ["closed", "live"] {
        let (jam, open) = jam_with(&app, &pool, &organiser, battle(1, "open")).await;
        set_jam(&pool, &jam, change).await;
        let late = send(
            &app,
            post(
                &format!("/api/battles/{open}/enter"),
                json!({}),
                Some(&nova),
            ),
        )
        .await;
        assert_eq!(late.status, StatusCode::CONFLICT, "{change}");
        assert_eq!(late.json["error"]["message"], "registration is closed");
        let shown = send(&app, get(&format!("/api/events/{jam}"), None)).await;
        assert_eq!(shown.json["takes_entries"], false, "{change}");
        // Closed or live, people may still say they're going.
        assert_eq!(shown.json["takes_attendees"], true, "{change}");
    }
}

#[sqlx::test]
async fn a_dancer_leaves_their_own_place_and_stays_going(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let (jam, battle_id) = jam_with(&app, &pool, &organiser, battle(1, "open")).await;
    let enter = format!("/api/battles/{battle_id}/enter");
    let (nova, _) = verified(&app, &pool, "nova@example.com").await;
    let (zed, zed_page) = verified(&app, &pool, "zed@example.com").await;

    let not_in = send(&app, delete(&enter, Some(&nova))).await;
    assert_eq!(not_in.status, StatusCode::NOT_FOUND);
    send(&app, post(&enter, json!({}), Some(&nova))).await;
    assert_eq!(
        send(&app, delete(&enter, Some(&nova))).await.status,
        StatusCode::NO_CONTENT
    );
    let battles = send(&app, get(&format!("/api/events/{jam}/battles"), None)).await;
    assert_eq!(battles.json[0]["entries"], json!([]));
    let shown = send(&app, get(&format!("/api/events/{jam}"), Some(&nova))).await;
    assert_eq!(shown.json["going"], true);
    // The place is free again.
    assert_eq!(
        send(&app, post(&enter, json!({}), Some(&nova)))
            .await
            .status,
        StatusCode::CREATED
    );

    // A place the organiser gave by hand is the dancer's to leave too.
    let entries = format!("/api/battles/{battle_id}/entries");
    let added = send(
        &app,
        post(
            &entries,
            json!({ "dancer_ids": [zed_page] }),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(added.status, StatusCode::CREATED, "{}", added.json);
    assert_eq!(
        send(&app, delete(&enter, Some(&zed))).await.status,
        StatusCode::NO_CONTENT
    );
}
