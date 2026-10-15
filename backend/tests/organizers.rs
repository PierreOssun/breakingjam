//! M12c: organiser pages, their jams, and Instagram verification.
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, get, post, publish, put, send, set_role, sign_up};

/// Signs up and registers a jam (which makes an organiser); returns (cookie, account id, jam id).
async fn organizer(app: &Router, email: &str, starts_on: &str) -> (String, String, String) {
    let cookie = sign_up(app, email).await;
    let jam = json!({ "name": "Jam", "starts_on": starts_on, "ends_on": starts_on,
                      "timezone": "Europe/Paris", "city": "Paris", "country": "FR" });
    let created = send(app, post("/api/events", jam, Some(&cookie))).await;
    assert_eq!(created.status, StatusCode::CREATED);
    let id = created.json["organizer_id"].as_str().unwrap().to_owned();
    let jam_id = created.json["id"].as_str().unwrap().to_owned();
    (cookie, id, jam_id)
}

fn profile(handle: Option<&str>) -> Value {
    json!({ "display_name": "Floor Lords e.V.", "instagram_handle": handle,
            "country": "FR", "city": " Paris ", "bio": "  " })
}

async fn edit(app: &Router, id: &str, body: Value, cookie: &str) -> TestResponse {
    send(
        app,
        put(&format!("/api/organizers/{id}"), body, Some(cookie)),
    )
    .await
}

async fn claim(app: &Router, id: &str, cookie: &str) -> TestResponse {
    let uri = format!("/api/organizers/{id}/claim");
    send(app, post(&uri, json!({}), Some(cookie))).await
}

#[sqlx::test]
async fn organisers_have_a_public_page_with_their_jams(pool: PgPool) {
    let app = app(pool.clone());
    let (cookie, id, jam) = organizer(&app, "org@example.com", "2030-06-01").await;
    let page = send(&app, get(&format!("/api/organizers/{id}"), None)).await;
    assert_eq!(page.status, StatusCode::OK);
    assert_eq!(page.json["display_name"], "Test");
    assert_eq!(page.json["can_edit"], false);
    assert!(
        page.json.get("email").is_none(),
        "the email is never public"
    );

    // Drafts and jams in review stay off the page until published.
    let events = format!("/api/organizers/{id}/events");
    let before = send(&app, get(&events, None)).await;
    assert_eq!(before.json["upcoming"], json!([]));
    publish(&app, &pool, &jam, &cookie).await;
    let after = send(&app, get(&events, None)).await;
    assert_eq!(after.json["upcoming"][0]["id"], jam.as_str());
    assert_eq!(after.json["past"], json!([]));

    // The jam page names its organiser.
    let jam_page = send(&app, get(&format!("/api/events/{jam}"), None)).await;
    assert_eq!(jam_page.json["organizer"]["id"], id.as_str());
    assert_eq!(jam_page.json["organizer"]["verified"], false);

    // Accounts that never registered a jam have no page.
    let user = sign_up(&app, "user@example.com").await;
    let me = send(&app, get("/api/auth/me", Some(&user))).await;
    let user_id = me.json["id"].as_str().unwrap();
    let none = send(&app, get(&format!("/api/organizers/{user_id}"), None)).await;
    assert_eq!(none.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn only_the_organiser_edits_their_page(pool: PgPool) {
    let app = app(pool);
    let (cookie, id, _) = organizer(&app, "org@example.com", "2030-06-01").await;

    let edited = edit(&app, &id, profile(Some("@Floor.Lords")), &cookie).await;
    assert_eq!(edited.status, StatusCode::OK);
    assert_eq!(edited.json["instagram_handle"], "floor.lords");
    assert_eq!(edited.json["city"], "Paris");
    assert_eq!(edited.json["bio"], Value::Null);
    assert_eq!(edited.json["can_edit"], true);
    let me = send(&app, get("/api/auth/me", Some(&cookie))).await;
    assert_eq!(me.json["display_name"], "Floor Lords e.V.");

    let (other, _, _) = organizer(&app, "other@example.com", "2030-06-01").await;
    let forbidden = edit(&app, &id, profile(None), &other).await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
    let taken = send(&app, get("/api/auth/me", Some(&other))).await;
    let other_id = taken.json["id"].as_str().unwrap();
    let duplicate = edit(&app, other_id, profile(Some("FLOOR.LORDS")), &other).await;
    assert_eq!(duplicate.status, StatusCode::CONFLICT);
    let invalid = edit(
        &app,
        &id,
        json!({ "display_name": " ", "country": "fr" }),
        &cookie,
    )
    .await;
    assert_eq!(invalid.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn instagram_verification_goes_through_review(pool: PgPool) {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let (cookie, id, jam) = organizer(&app, "org@example.com", "2030-06-01").await;

    let no_handle = claim(&app, &id, &cookie).await;
    assert_eq!(no_handle.status, StatusCode::UNPROCESSABLE_ENTITY);
    edit(&app, &id, profile(Some("floor.lords")), &cookie).await;

    let opened = claim(&app, &id, &cookie).await;
    assert_eq!(opened.status, StatusCode::OK);
    assert_eq!(opened.json["status"], "pending");
    assert_eq!(opened.json["instagram_handle"], "floor.lords");
    let code = opened.json["code"].as_str().unwrap().to_owned();
    assert_eq!(claim(&app, &id, &cookie).await.json["code"], code.as_str());
    let mine = send(
        &app,
        get(&format!("/api/organizers/{id}/claim"), Some(&cookie)),
    )
    .await;
    assert_eq!(mine.json["code"], code.as_str());

    let as_organizer = send(&app, get("/api/admin/organizer-claims", Some(&cookie))).await;
    assert_eq!(as_organizer.status, StatusCode::FORBIDDEN);
    let queue = send(&app, get("/api/admin/organizer-claims", Some(&admin))).await;
    assert_eq!(queue.json["items"][0]["code"], code.as_str());
    assert_eq!(queue.json["items"][0]["user"]["email"], "org@example.com");

    let claim_id = opened.json["id"].as_str().unwrap();
    let uri = format!("/api/admin/organizer-claims/{claim_id}/approve");
    let approved = send(&app, post(&uri, json!({}), Some(&admin))).await;
    assert_eq!(approved.status, StatusCode::OK);
    let page = send(&app, get(&format!("/api/organizers/{id}"), None)).await;
    assert!(page.json["verified_at"].is_string());
    let jam_page = send(&app, get(&format!("/api/events/{jam}"), Some(&cookie))).await;
    assert_eq!(jam_page.json["organizer"]["verified"], true);
    assert_eq!(claim(&app, &id, &cookie).await.status, StatusCode::CONFLICT);

    // A new handle is a new identity: the tick goes, and must be earned again.
    let changed = edit(&app, &id, profile(Some("floorlords_official")), &cookie).await;
    assert_eq!(changed.json["verified_at"], Value::Null);
    let keeps = edit(&app, &id, profile(Some("floorlords_official")), &cookie).await;
    assert_eq!(keeps.json["verified_at"], Value::Null);
}

#[sqlx::test]
async fn a_handle_changed_during_review_cannot_be_approved(pool: PgPool) {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let (cookie, id, _) = organizer(&app, "org@example.com", "2030-06-01").await;
    edit(&app, &id, profile(Some("floor.lords")), &cookie).await;
    let opened = claim(&app, &id, &cookie).await;
    let claim_id = opened.json["id"].as_str().unwrap();

    // Changing the handle withdraws the pending claim on the old one.
    edit(&app, &id, profile(Some("someone.else")), &cookie).await;
    let uri = format!("/api/admin/organizer-claims/{claim_id}/approve");
    let refused = send(&app, post(&uri, json!({}), Some(&admin))).await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    let page = send(&app, get(&format!("/api/organizers/{id}"), None)).await;
    assert_eq!(page.json["verified_at"], Value::Null);

    // A fresh claim is for the new handle.
    let fresh = claim(&app, &id, &cookie).await;
    assert_eq!(fresh.json["instagram_handle"], "someone.else");
    assert_ne!(fresh.json["id"], opened.json["id"]);
}

#[sqlx::test]
async fn a_rejected_claim_can_be_made_again(pool: PgPool) {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let (cookie, id, _) = organizer(&app, "org@example.com", "2030-06-01").await;
    edit(&app, &id, profile(Some("floor.lords")), &cookie).await;
    let first = claim(&app, &id, &cookie).await;
    let first_id = first.json["id"].as_str().unwrap();

    let uri = format!("/api/admin/organizer-claims/{first_id}/reject");
    let rejected = send(&app, post(&uri, json!({}), Some(&admin))).await;
    assert_eq!(rejected.status, StatusCode::OK);
    assert_eq!(rejected.json["status"], "rejected");
    let again = send(&app, post(&uri, json!({}), Some(&admin))).await;
    assert_eq!(again.status, StatusCode::CONFLICT, "already reviewed");
    let page = send(&app, get(&format!("/api/organizers/{id}"), None)).await;
    assert_eq!(page.json["verified_at"], Value::Null);

    let retry = claim(&app, &id, &cookie).await;
    assert_eq!(retry.json["status"], "pending");
    assert_ne!(retry.json["id"], first.json["id"]);
}
