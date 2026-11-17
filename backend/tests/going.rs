//! "I'm going" on a jam, and who is (M32).
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::json;
use sqlx::PgPool;
use test_app::{app, delete, get, id_of, post, publish, put, send, sign_up};

/// An organiser's published jam, to come; returns its id.
async fn published_jam(app: &Router, pool: &PgPool, organiser: &str) -> String {
    let body = json!({ "name": "Winter Cypher", "starts_on": "2030-12-12",
                       "ends_on": "2030-12-12", "timezone": "Europe/Zurich" });
    let id = id_of(&send(app, post("/api/events", body, Some(organiser))).await);
    publish(pool, &id).await;
    id
}

/// Gives `email` a page of its own and, when `verified`, the approved claim on it.
async fn page_of(app: &Router, pool: &PgPool, (email, cookie): (&str, &str), verified: bool) {
    let name = email.split('@').next().unwrap();
    let body = json!({ "dancer_name": name, "country": "CH", "instagram_handle": name });
    let page = send(app, post("/api/dancers/mine", body, Some(cookie))).await;
    assert_eq!(page.status, StatusCode::CREATED, "{}", page.json);
    if verified {
        sqlx::query!(
            "update dancers set verified_at = now(), instagram_hidden = true,
               user_id = (select id from app_users where email = $1::text::citext)
             where id = $2::text::uuid",
            email,
            id_of(&page),
        )
        .execute(pool)
        .await
        .unwrap();
    }
}

#[sqlx::test]
async fn going_counts_once_per_account_and_can_be_taken_back(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let nova = sign_up(&app, &pool, "nova@example.com").await;
    let id = published_jam(&app, &pool, &organiser).await;
    let uri = format!("/api/events/{id}/going");

    let first = send(&app, put(&uri, json!({}), Some(&nova))).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.json);
    assert_eq!(first.json, json!({ "going_count": 1, "going": true }));
    // Twice is still once.
    let again = send(&app, put(&uri, json!({}), Some(&nova))).await;
    assert_eq!(again.json, json!({ "going_count": 1, "going": true }));
    send(&app, put(&uri, json!({}), Some(&organiser))).await;

    // The jam page says it too, to each as they are.
    let page = |cookie| send(&app, get(&format!("/api/events/{id}"), cookie));
    let seen = page(Some(&nova)).await.json;
    assert_eq!(
        (&seen["going_count"], &seen["going"]),
        (&json!(2), &json!(true))
    );
    let visitor = page(None).await.json;
    assert_eq!(
        (&visitor["going_count"], &visitor["going"]),
        (&json!(2), &json!(false))
    );

    let back = send(&app, delete(&uri, Some(&nova))).await;
    assert_eq!(back.status, StatusCode::OK);
    assert_eq!(back.json, json!({ "going_count": 1, "going": false }));
    let gone_twice = send(&app, delete(&uri, Some(&nova))).await;
    assert_eq!(gone_twice.json, json!({ "going_count": 1, "going": false }));
}

#[sqlx::test]
async fn only_an_announced_jam_still_to_come_takes_people(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let nova = sign_up(&app, &pool, "nova@example.com").await;
    let body = json!({ "name": "Draft", "starts_on": "2030-12-12", "ends_on": "2030-12-12",
                       "timezone": "Europe/Zurich" });
    let draft = id_of(&send(&app, post("/api/events", body, Some(&organiser))).await);
    let going = |id: &str| format!("/api/events/{id}/going");

    // A draft is its organiser's alone: others don't even see it.
    let stranger = send(&app, put(&going(&draft), json!({}), Some(&nova))).await;
    assert_eq!(stranger.status, StatusCode::NOT_FOUND);
    let own = send(&app, put(&going(&draft), json!({}), Some(&organiser))).await;
    assert_eq!(own.status, StatusCode::CONFLICT);

    let cancelled = published_jam(&app, &pool, &organiser).await;
    let past = published_jam(&app, &pool, &organiser).await;
    // Someone said they were going before the jam was over.
    send(&app, put(&going(&past), json!({}), Some(&nova))).await;
    sqlx::query!(
        "update events set status = 'cancelled' where id = $1::text::uuid",
        cancelled
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query!(
        "update events set starts_on = '2020-01-04', ends_on = '2020-01-04' where id = $1::text::uuid",
        past
    )
    .execute(&pool)
    .await
    .unwrap();
    for id in [&cancelled, &past] {
        let late = send(&app, put(&going(id), json!({}), Some(&nova))).await;
        assert_eq!(late.status, StatusCode::CONFLICT, "{id}");
    }
    // Taking it back is always possible.
    let back = send(&app, delete(&going(&past), Some(&nova))).await;
    assert_eq!(back.json, json!({ "going_count": 0, "going": false }));

    let logged_out = send(&app, put(&going(&past), json!({}), None)).await;
    assert_eq!(logged_out.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn the_list_names_verified_dancers_only(pool: PgPool) {
    let app = app(pool.clone());
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let id = published_jam(&app, &pool, &organiser).await;
    let uri = format!("/api/events/{id}/going");
    for (email, verified) in [
        ("zed@example.com", true),
        ("nova@example.com", true),
        ("fake@example.com", false),
    ] {
        let cookie = sign_up(&app, &pool, email).await;
        page_of(&app, &pool, (email, &cookie), verified).await;
        send(&app, put(&uri, json!({}), Some(&cookie))).await;
    }
    // A spectator without a page of their own.
    send(&app, put(&uri, json!({}), Some(&organiser))).await;

    let list = send(&app, get(&uri, None)).await;
    assert_eq!(list.status, StatusCode::OK);
    assert_eq!(list.json["going_count"], 4);
    assert_eq!(list.json["others"], 2);
    let dancers = list.json["dancers"].as_array().unwrap();
    let names: Vec<_> = dancers.iter().map(|d| &d["dancer_name"]).collect();
    assert_eq!(names, [&json!("nova"), &json!("zed")]);
    // A handle hidden on the page stays hidden here.
    assert_eq!(dancers[0]["instagram_handle"], json!(null));
}
