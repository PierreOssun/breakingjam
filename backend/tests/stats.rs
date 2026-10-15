mod test_app;

use axum::http::StatusCode;
use serde_json::json;
use sqlx::PgPool;
use test_app::{app, get, id_of, post, send, set_role, sign_up};

#[sqlx::test]
async fn admin_stats_count_jams_dancers_accounts_and_queues(pool: PgPool) {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let organizer = sign_up(&app, "org@example.com").await;

    let jam = |name: &str, day: &str| {
        json!({ "name": name, "starts_on": day, "ends_on": day,
                "timezone": "Europe/Paris", "city": "Paris", "country": "FR" })
    };
    let create = async |name: &str, day: &str| {
        id_of(&send(&app, post("/api/events", jam(name, day), Some(&organizer))).await)
    };
    let upcoming = create("Upcoming", "2030-06-01").await;
    let past = create("Past", "2020-06-01").await;
    let in_review = create("In review", "2030-07-01").await;
    create("Draft", "2030-08-01").await;
    sqlx::query!(
        "update events set status = 'published' where id = any($1::text[]::uuid[])",
        &[upcoming, past] as &[String],
    )
    .execute(&pool)
    .await
    .unwrap();
    let submit = format!("/api/events/{in_review}/submit");
    send(&app, post(&submit, json!({}), Some(&organizer))).await;

    for (name, handle) in [("Lil G", Some("lilg")), ("Ventus", None)] {
        let body = json!({ "dancer_name": name, "country": "FR", "instagram_handle": handle });
        send(&app, post("/api/dancers", body, Some(&organizer))).await;
    }
    sqlx::query!("update dancers set verified_at = now() where dancer_name = 'Lil G'")
        .execute(&pool)
        .await
        .unwrap();

    let stats = send(&app, get("/api/admin/stats", Some(&admin))).await;
    assert_eq!(stats.status, StatusCode::OK);
    assert_eq!(
        stats.json,
        json!({
            "jams_upcoming": 1, "jams_past": 1, "jams_in_review": 1, "jams_draft": 1,
            "jams_cancelled": 0,
            "dancers": 2, "dancers_verified": 1, "dancers_with_instagram": 1,
            "organizers": 1, "organizers_verified": 0,
            "accounts": 2, "accounts_new": 2,
            "dancer_claims_pending": 0, "organizer_claims_pending": 0
        })
    );

    let forbidden = send(&app, get("/api/admin/stats", Some(&organizer))).await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn site_stats_count_public_jams_battles_and_dancers(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = sign_up(&app, "org@example.com").await;
    let one_v_one = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    let jam = async |name: &str, country: &str, battles: usize| {
        let body = json!({ "name": name, "starts_on": "2030-06-01", "ends_on": "2030-06-01",
                           "timezone": "Europe/Paris", "city": "City", "country": country });
        let id = id_of(&send(&app, post("/api/events", body, Some(&organizer))).await);
        for _ in 0..battles {
            let uri = format!("/api/events/{id}/battles");
            send(&app, post(&uri, one_v_one.clone(), Some(&organizer))).await;
        }
        id
    };
    let paris = jam("Paris", "FR", 2).await;
    let lyon = jam("Lyon", "FR", 1).await;
    let zurich = jam("Zurich", "CH", 1).await;
    jam("Secret draft", "DE", 3).await;
    let cancelled = jam("Called off", "IT", 1).await;
    sqlx::query!(
        "update events set status = 'published' where id = any($1::text[]::uuid[])",
        &[paris, lyon, zurich] as &[String],
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query!(
        "update events set status = 'cancelled' where id = $1::text::uuid",
        cancelled
    )
    .execute(&pool)
    .await
    .unwrap();
    let dancer = json!({ "dancer_name": "Lil G", "country": "FR" });
    send(&app, post("/api/dancers", dancer, Some(&organizer))).await;

    let stats = send(&app, get("/api/stats", None)).await;
    assert_eq!(stats.status, StatusCode::OK);
    assert_eq!(
        stats.json,
        json!({
            "countries": 2, "battles": 4, "dancers": 1,
            "battles_by_country": [
                { "country": "FR", "battles": 3 },
                { "country": "CH", "battles": 1 }
            ]
        }),
        "drafts and cancelled jams don't count"
    );
}
