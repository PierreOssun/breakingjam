mod test_app;

use std::time::Duration;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{
    Files, MEDIA_URL, Objects, TestResponse, app_with_media, delete, get, id_of, jpeg, post,
    post_files, publish, send, set_role, sign_up,
};

fn jam() -> Value {
    json!({ "name": "Block Party", "starts_on": "2030-11-22", "ends_on": "2030-11-22",
            "timezone": "Europe/Paris", "city": "Marseille", "country": "FR",
            "lat": 43.2965, "lng": 5.3698 })
}

/// A published jam on the map, and its owner's session.
async fn published_jam(app: &Router, pool: &PgPool) -> (String, String) {
    let owner = sign_up(app, "owner@example.com").await;
    let id = id_of(&send(app, post("/api/events", jam(), Some(&owner))).await);
    publish(app, pool, &id, &owner).await;
    (id, owner)
}

async fn upload(app: &Router, jam: &str, cookie: &str) -> TestResponse {
    let (flyer, card) = (jpeg(1080, 1350), jpeg(540, 675));
    let parts: &Files = &[("flyer", &flyer), ("card", &card)];
    let uri = format!("/api/events/{jam}/flyer");
    send(app, post_files(&uri, parts, Some(cookie))).await
}

/// The stored keys, card image first as it sorts first.
fn keys(objects: &Objects) -> Vec<String> {
    objects.lock().unwrap().keys().cloned().collect()
}

/// Waits for the store to hold exactly `expected`: replaced images are deleted in the background.
async fn assert_stored(objects: &Objects, expected: &[String]) {
    for _ in 0..200 {
        if keys(objects) == expected {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(keys(objects), expected);
}

/// The store key behind a public URL the API returned.
fn key_of(url: &Value) -> String {
    let url = url.as_str().unwrap();
    url.strip_prefix(&format!("{MEDIA_URL}/"))
        .unwrap()
        .to_owned()
}

#[sqlx::test]
async fn an_upload_replaces_the_generated_flyer_everywhere(pool: PgPool) {
    let (app, objects) = app_with_media(pool.clone()).await;
    let (id, owner) = published_jam(&app, &pool).await;

    let uploaded = upload(&app, &id, &owner).await;
    assert_eq!(uploaded.status, StatusCode::OK, "{}", uploaded.json);
    let full = key_of(&uploaded.json["flyer_url"]);
    let card = key_of(&uploaded.json["flyer_card_url"]);
    assert!(full.starts_with(&format!("flyers/{id}/")) && full.ends_with(".jpg"));
    assert_eq!(card, full.replace(".jpg", "-card.jpg"));
    assert_eq!(keys(&objects), [card, full.clone()]);
    let (headers, body) = objects.lock().unwrap()[&full].clone();
    assert_eq!(headers["content-type"], "image/jpeg");
    assert_eq!(
        headers["cache-control"],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(body, jpeg(1080, 1350));

    // Live at once: the jam page and the map show it with no review.
    let page = send(&app, get(&format!("/api/events/{id}"), None)).await;
    assert_eq!(page.json["flyer_url"], uploaded.json["flyer_url"]);
    let map = send(&app, get("/api/events.geojson", None)).await;
    let point = &map.json["features"][0]["properties"];
    assert_eq!(point["flyer_card_url"], uploaded.json["flyer_card_url"]);
}

#[sqlx::test]
async fn a_new_upload_deletes_the_old_images(pool: PgPool) {
    let (app, objects) = app_with_media(pool.clone()).await;
    let (id, owner) = published_jam(&app, &pool).await;

    upload(&app, &id, &owner).await;
    let second = upload(&app, &id, &owner).await;
    let expected = [
        key_of(&second.json["flyer_card_url"]),
        key_of(&second.json["flyer_url"]),
    ];
    assert_stored(&objects, &expected).await;
}

#[sqlx::test]
async fn admins_can_take_a_flyer_down(pool: PgPool) {
    let (app, objects) = app_with_media(pool.clone()).await;
    let (id, owner) = published_jam(&app, &pool).await;
    upload(&app, &id, &owner).await;
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;

    let removed = send(
        &app,
        delete(&format!("/api/events/{id}/flyer"), Some(&admin)),
    )
    .await;
    assert_eq!(removed.status, StatusCode::OK, "{}", removed.json);
    assert_eq!(removed.json["flyer_url"], Value::Null);
    assert_eq!(removed.json["flyer_card_url"], Value::Null);
    // The images are deleted too.
    assert_stored(&objects, &[]).await;
}

#[sqlx::test]
async fn deleting_the_jam_deletes_its_flyer(pool: PgPool) {
    let (app, objects) = app_with_media(pool.clone()).await;
    let (id, owner) = published_jam(&app, &pool).await;
    upload(&app, &id, &owner).await;

    let deleted = send(&app, delete(&format!("/api/events/{id}"), Some(&owner))).await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    // Nothing could reach them once the jam is gone.
    assert_stored(&objects, &[]).await;
}

#[sqlx::test]
async fn only_the_browsers_two_jpegs_are_accepted(pool: PgPool) {
    let (app, objects) = app_with_media(pool.clone()).await;
    let (id, owner) = published_jam(&app, &pool).await;
    let uri = format!("/api/events/{id}/flyer");
    let (full, card) = (jpeg(1080, 1350), jpeg(540, 675));
    let (square, png) = (jpeg(1080, 1080), b"\x89PNG\r\n\x1a\n".to_vec());
    let mut huge = full.clone();
    huge.resize(2 * 1024 * 1024 + 1, 0);
    let cases: [(&Files, &str); 5] = [
        (&[("flyer", &square), ("card", &card)], "flyer"),
        (&[("flyer", &png), ("card", &card)], "flyer"),
        (&[("flyer", &huge), ("card", &card)], "flyer"),
        (&[("flyer", &full)], "card"),
        (&[("flyer", &full), ("card", &full)], "card"),
    ];
    for (parts, field) in cases {
        let response = send(&app, post_files(&uri, parts, Some(&owner))).await;
        assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY, "{field}");
        assert_eq!(response.json["error"]["fields"][0]["field"], field);
    }
    let not_multipart = send(&app, post(&uri, json!({}), Some(&owner))).await;
    assert_eq!(not_multipart.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(keys(&objects).is_empty(), "nothing reaches the store");
}
