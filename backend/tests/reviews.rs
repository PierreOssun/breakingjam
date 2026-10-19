mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, get, id_of, post, send, set_role, sign_up};

struct World {
    app: Router,
    admin: String,
    organizer: String,
}

async fn world(pool: PgPool) -> World {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let organizer = sign_up(&app, "org@example.com").await;
    World {
        app,
        admin,
        organizer,
    }
}

impl World {
    /// A new draft by `cookie`; returns its id.
    async fn draft(&self, cookie: &str, name: &str) -> String {
        let body = json!({ "name": name, "starts_on": "2030-06-01", "ends_on": "2030-06-01",
                           "timezone": "Europe/Paris", "city": "Paris", "country": "FR",
                           "lat": 48.86, "lng": 2.35 });
        id_of(&send(&self.app, post("/api/events", body, Some(cookie))).await)
    }

    async fn call(&self, uri: &str, body: Value, cookie: Option<&str>) -> TestResponse {
        send(&self.app, post(uri, body, cookie)).await
    }

    async fn read(&self, uri: &str, cookie: Option<&str>) -> TestResponse {
        send(&self.app, get(uri, cookie)).await
    }
}

#[sqlx::test]
async fn jams_the_team_entered_name_no_organiser(pool: PgPool) {
    let w = world(pool.clone()).await;
    let team = sign_up(&w.app, "team@example.com").await;
    set_role(&pool, "team@example.com", "seed_admin").await;
    let jam = w.draft(&team, "BC One 2023").await;
    w.call(&format!("/api/events/{jam}/submit"), json!({}), Some(&team))
        .await;

    let queue = w.read("/api/admin/events", Some(&w.admin)).await;
    assert_eq!(queue.json["items"][0]["id"], jam.as_str());
    assert_eq!(queue.json["items"][0]["organizer"], Value::Null);
}

#[sqlx::test]
async fn organisers_submit_and_admins_approve(pool: PgPool) {
    let w = world(pool).await;
    let jam = w.draft(&w.organizer, "Paris Cypher").await;

    let submitted = w
        .call(
            &format!("/api/events/{jam}/submit"),
            json!({}),
            Some(&w.organizer),
        )
        .await;
    assert_eq!(submitted.json["status"], "in_review");
    // Still private: no page, no map point, not in the public list.
    let page = format!("/api/events/{jam}");
    assert_eq!(w.read(&page, None).await.status, StatusCode::NOT_FOUND);
    let map = w.read("/api/events.geojson", None).await;
    assert_eq!(map.json["features"], json!([]));
    let list = w.read("/api/events?status=in_review", None).await;
    assert_eq!(list.json["items"], json!([]));

    let queue = w.read("/api/admin/events", Some(&w.admin)).await;
    assert_eq!(queue.json["items"][0]["id"], jam.as_str());
    assert_eq!(queue.json["items"][0]["organizer"]["display_name"], "Test");
    assert_eq!(
        w.read("/api/admin/events", Some(&w.organizer)).await.status,
        StatusCode::FORBIDDEN
    );

    let approve = format!("/api/admin/events/{jam}/approve");
    let by_owner = w.call(&approve, json!({}), Some(&w.organizer)).await;
    assert_eq!(by_owner.status, StatusCode::FORBIDDEN);
    let approved = w.call(&approve, json!({}), Some(&w.admin)).await;
    assert_eq!(approved.json["status"], "published");
    assert_eq!(w.read(&page, None).await.status, StatusCode::OK);
    let again = w.call(&approve, json!({}), Some(&w.admin)).await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    let queue = w.read("/api/admin/events", Some(&w.admin)).await;
    assert_eq!(queue.json["items"], json!([]));
}

#[sqlx::test]
async fn rejected_jams_go_back_to_draft_with_a_note(pool: PgPool) {
    let w = world(pool).await;
    let jam = w.draft(&w.organizer, "Paris Cypher").await;
    let submit = format!("/api/events/{jam}/submit");
    w.call(&submit, json!({}), Some(&w.organizer)).await;

    let reject = format!("/api/admin/events/{jam}/reject");
    let blank = w
        .call(&reject, json!({ "note": "  " }), Some(&w.admin))
        .await;
    assert_eq!(blank.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(blank.json["error"]["fields"][0]["field"], "note");

    let note = json!({ "note": " Add the venue address. " });
    let rejected = w.call(&reject, note, Some(&w.admin)).await;
    assert_eq!(rejected.json["status"], "draft");
    let seen = w
        .read(&format!("/api/events/{jam}"), Some(&w.organizer))
        .await;
    assert_eq!(seen.json["review_note"], "Add the venue address.");

    let resubmitted = w.call(&submit, json!({}), Some(&w.organizer)).await;
    assert_eq!(resubmitted.json["status"], "in_review");
    assert_eq!(resubmitted.json["review_note"], Value::Null);
}

#[sqlx::test]
async fn the_team_publishes_without_review(pool: PgPool) {
    let w = world(pool.clone()).await;
    let team = sign_up(&w.app, "team@example.com").await;
    set_role(&pool, "team@example.com", "seed_admin").await;
    let jam = w.draft(&team, "Team Jam").await;

    let publish = format!("/api/events/{jam}/publish");
    let published = w.call(&publish, json!({}), Some(&team)).await;
    assert_eq!(published.json["status"], "published");

    let theirs = w.draft(&w.organizer, "Their Jam").await;
    let unreviewed = w
        .call(
            &format!("/api/events/{theirs}/publish"),
            json!({}),
            Some(&w.organizer),
        )
        .await;
    assert_eq!(unreviewed.status, StatusCode::FORBIDDEN);
    // Reviewing is for admins only, not the team.
    w.call(
        &format!("/api/events/{theirs}/submit"),
        json!({}),
        Some(&w.organizer),
    )
    .await;
    let by_team = w
        .call(
            &format!("/api/admin/events/{theirs}/approve"),
            json!({}),
            Some(&team),
        )
        .await;
    assert_eq!(by_team.status, StatusCode::FORBIDDEN);
}
