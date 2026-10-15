mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{app, delete, get, id_of, post, put, send, set_role, sign_up};

fn crew(name: &str) -> Value {
    json!({ "name": name, "country": "FR", "city": " ", "instagram_handle": "@Floor.Lords" })
}

async fn organizer(app: &Router, pool: &PgPool) -> String {
    let cookie = sign_up(app, "org@example.com").await;
    set_role(pool, "org@example.com", "organizer").await;
    cookie
}

async fn new_dancer(app: &Router, cookie: &str) -> String {
    let body = json!({ "dancer_name": "Lil G", "country": "FR" });
    id_of(&send(app, post("/api/dancers", body, Some(cookie))).await)
}

#[sqlx::test]
async fn writes_need_organizer(pool: PgPool) {
    let app = app(pool.clone());
    let user = sign_up(&app, "user@example.com").await;
    let as_user = send(&app, post("/api/crews", crew("Floor Lords"), Some(&user))).await;
    assert_eq!(as_user.status, StatusCode::FORBIDDEN);

    let organizer = organizer(&app, &pool).await;
    let created = send(
        &app,
        post("/api/crews", crew("Floor Lords"), Some(&organizer)),
    )
    .await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.json["instagram_handle"], "floor.lords");
    assert_eq!(created.json["city"], Value::Null);
    assert_eq!(created.json["members"], json!([]));

    let uri = format!("/api/crews/{}", id_of(&created));
    let renamed = send(&app, put(&uri, crew("Floor Lords FR"), Some(&organizer))).await;
    assert_eq!(renamed.json["name"], "Floor Lords FR");
    assert_eq!(
        send(&app, put(&uri, crew("Hijack"), Some(&user)))
            .await
            .status,
        StatusCode::FORBIDDEN
    );

    assert_eq!(
        send(&app, delete(&uri, Some(&organizer))).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        send(&app, get(&uri, None)).await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test]
async fn search_by_name(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = organizer(&app, &pool).await;
    for name in ["Floor Lords", "Spin Syndicate", "Floor Gang"] {
        send(&app, post("/api/crews", crew(name), Some(&organizer))).await;
    }

    let response = send(&app, get("/api/crews?q=floor", None)).await;
    let names: Vec<&str> = response.json["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Floor Gang", "Floor Lords"]);
}

#[sqlx::test]
async fn membership_lifecycle(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = organizer(&app, &pool).await;
    let crew_id = id_of(
        &send(
            &app,
            post("/api/crews", crew("Floor Lords"), Some(&organizer)),
        )
        .await,
    );
    let dancer_id = new_dancer(&app, &organizer).await;
    let members_uri = format!("/api/crews/{crew_id}/members");

    let added = send(
        &app,
        post(
            &members_uri,
            json!({ "dancer_id": dancer_id, "since": "2019-05-01" }),
            Some(&organizer),
        ),
    )
    .await;
    assert_eq!(added.status, StatusCode::CREATED);
    assert_eq!(added.json["members"][0]["dancer_name"], "Lil G");
    assert_eq!(added.json["members"][0]["since"], "2019-05-01");

    let again = send(
        &app,
        post(
            &members_uri,
            json!({ "dancer_id": dancer_id }),
            Some(&organizer),
        ),
    )
    .await;
    assert_eq!(again.status, StatusCode::CONFLICT);

    let profile = send(&app, get(&format!("/api/dancers/{dancer_id}"), None)).await;
    assert_eq!(profile.json["crews"][0]["name"], "Floor Lords");

    let leave_uri = format!("{members_uri}/{dancer_id}");
    assert_eq!(
        send(&app, delete(&leave_uri, Some(&organizer)))
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    let crew = send(&app, get(&format!("/api/crews/{crew_id}"), None)).await;
    assert_eq!(crew.json["members"], json!([]));
    let profile = send(&app, get(&format!("/api/dancers/{dancer_id}"), None)).await;
    assert_eq!(profile.json["crews"], json!([]));
    assert_eq!(
        send(&app, delete(&leave_uri, Some(&organizer)))
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    let rejoined = send(
        &app,
        post(
            &members_uri,
            json!({ "dancer_id": dancer_id }),
            Some(&organizer),
        ),
    )
    .await;
    assert_eq!(
        rejoined.status,
        StatusCode::CREATED,
        "rejoining with an unknown date"
    );
}

#[sqlx::test]
async fn membership_needs_existing_dancer_and_crew(pool: PgPool) {
    let app = app(pool.clone());
    let organizer = organizer(&app, &pool).await;
    let crew_id = id_of(
        &send(
            &app,
            post("/api/crews", crew("Floor Lords"), Some(&organizer)),
        )
        .await,
    );

    let missing = send(
        &app,
        post(
            &format!("/api/crews/{crew_id}/members"),
            json!({ "dancer_id": uuid::Uuid::now_v7() }),
            Some(&organizer),
        ),
    )
    .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
}
