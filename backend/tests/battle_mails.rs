//! The emails about entering battles, in each reader's own language (M32 step 4).
mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{
    Mails, PASSWORD, app_with_mail, delete, id_of, mail_with, post, publish, put, send, sign_up,
};

/// A published jam with one battle taking dancers as `registration` says; returns the battle.
async fn battle(
    app: &Router,
    pool: &PgPool,
    organiser: &str,
    registration: &str,
    size: i16,
) -> String {
    let body = json!({ "name": "Winter Cypher", "starts_on": "2030-12-12", "ends_on": "2030-12-12",
                       "timezone": "Europe/Zurich", "venue_name": "Rote Fabrik", "city": "Zürich",
                       "country": "CH", "lat": 47.37, "lng": 8.54 });
    let jam = id_of(&send(app, post("/api/events", body, Some(organiser))).await);
    let battle = json!({ "format": "team", "team_size": size, "gender": "bgirl", "age": "adult",
                         "age_min": 18, "registration": registration,
                         "starts_at": "2030-12-12T16:00:00" });
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
    id_of(&added)
}

/// Signs `email` up with a verified page named after it; returns its cookie.
async fn dancer(app: &Router, pool: &PgPool, email: &str) -> String {
    let cookie = sign_up(app, pool, email).await;
    let name = email.split('@').next().unwrap();
    let page = id_of(
        &send(
            app,
            post(
                "/api/dancers/mine",
                json!({ "dancer_name": name, "country": "CH" }),
                Some(&cookie),
            ),
        )
        .await,
    );
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
    cookie
}

fn to<'a>(address: &'a str, subject: &'a str) -> impl Fn(&Value) -> bool + 'a {
    move |mail| mail["to"] == address && mail["subject"] == subject
}

#[sqlx::test]
async fn the_organiser_hears_of_each_dancer_who_enters(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let battle_id = battle(&app, &pool, &organiser, "open", 1).await;
    let nova = dancer(&app, &pool, "nova@example.com").await;

    let entered = send(
        &app,
        post(
            &format!("/api/battles/{battle_id}/enter"),
            json!({}),
            Some(&nova),
        ),
    )
    .await;
    assert_eq!(entered.status, StatusCode::CREATED);

    let mail = mail_with(
        &mails,
        to("org@example.com", "nova entered 1v1 Bgirl at Winter Cypher"),
    )
    .await;
    let text = mail["text"].as_str().unwrap();
    assert!(text.contains("/jams/winter-cypher-"), "{text}");
}

#[sqlx::test]
async fn each_side_reads_a_request_in_their_own_language(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    // The organiser reads the site in French; the dancer in English, as they signed up.
    let switched = send(
        &app,
        put(
            "/api/auth/language",
            json!({ "language": "fr" }),
            Some(&organiser),
        ),
    )
    .await;
    assert_eq!(switched.status, StatusCode::NO_CONTENT);
    let battle_id = battle(&app, &pool, &organiser, "approval", 1).await;
    let nova = dancer(&app, &pool, "nova@example.com").await;

    let asked = send(
        &app,
        post(
            &format!("/api/battles/{battle_id}/requests"),
            json!({}),
            Some(&nova),
        ),
    )
    .await;
    assert_eq!(asked.status, StatusCode::CREATED, "{}", asked.json);
    mail_with(
        &mails,
        to(
            "org@example.com",
            "nova demande à participer à 1v1 Bgirl (Winter Cypher)",
        ),
    )
    .await;
    mail_with(
        &mails,
        to(
            "nova@example.com",
            "Request sent: 1v1 Bgirl at Winter Cypher",
        ),
    )
    .await;

    let request = id_of(&asked);
    send(
        &app,
        post(
            &format!("/api/requests/{request}/accept"),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    let accepted = mail_with(
        &mails,
        to("nova@example.com", "You're in: 1v1 Bgirl at Winter Cypher"),
    )
    .await;
    let text = accepted["text"].as_str().unwrap();
    // The day and start in the reader's words, and where.
    assert!(
        text.contains("Thursday 12 December, starts 16:00\nRote Fabrik, Zürich"),
        "{text}"
    );
}

#[sqlx::test]
async fn a_declined_dancer_is_told_and_a_team_is_named(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let battle_id = battle(&app, &pool, &organiser, "approval", 2).await;
    let zed = dancer(&app, &pool, "zed@example.com").await;
    // Logging in keeps the language the site is in: German from now on.
    let login = json!({ "email": "zed@example.com", "password": PASSWORD, "language": "de" });
    let zed_de = send(&app, post("/api/auth/login", login, None))
        .await
        .cookie("bj_session")
        .unwrap();
    let mate = id_of(
        &send(
            &app,
            post(
                "/api/dancers",
                json!({ "dancer_name": "Lumen", "country": "CH" }),
                Some(&zed),
            ),
        )
        .await,
    );

    let body = json!({ "team_name": "Duo", "teammates": [mate] });
    let asked = send(
        &app,
        post(
            &format!("/api/battles/{battle_id}/requests"),
            body,
            Some(&zed_de),
        ),
    )
    .await;
    assert_eq!(asked.status, StatusCode::CREATED, "{}", asked.json);
    mail_with(
        &mails,
        to(
            "org@example.com",
            "Duo asked to enter 2v2 Bgirl at Winter Cypher",
        ),
    )
    .await;

    let request = id_of(&asked);
    send(
        &app,
        post(
            &format!("/api/requests/{request}/decline"),
            json!({}),
            Some(&organiser),
        ),
    )
    .await;
    mail_with(
        &mails,
        to(
            "zed@example.com",
            "Deine Anfrage für 2v2 Bgirl (Winter Cypher)",
        ),
    )
    .await;
}

/// How many emails `wanted` got, once the asker's `sent`-th "Request sent" is in.
async fn count_after(mails: &Mails, sent: usize, wanted: impl Fn(&Value) -> bool) -> usize {
    let asker = to(
        "nova@example.com",
        "Request sent: 1v1 Bgirl at Winter Cypher",
    );
    for _ in 0..200 {
        if mails.lock().unwrap().iter().filter(|m| asker(m)).count() >= sent {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    // The organiser's email goes out from the same request as the asker's: give it a moment.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    mails.lock().unwrap().iter().filter(|m| wanted(m)).count()
}

#[sqlx::test]
async fn asking_again_and_again_emails_the_organiser_twice_a_day(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    let organiser = sign_up(&app, &pool, "org@example.com").await;
    let battle_id = battle(&app, &pool, &organiser, "approval", 1).await;
    let nova = dancer(&app, &pool, "nova@example.com").await;

    for round in 0..3 {
        let ask = post(
            &format!("/api/battles/{battle_id}/requests"),
            json!({}),
            Some(&nova),
        );
        let asked = send(&app, ask).await;
        assert_eq!(asked.status, StatusCode::CREATED, "{}", asked.json);
        if round < 2 {
            let request = id_of(&asked);
            let cancelled = send(
                &app,
                delete(&format!("/api/requests/{request}"), Some(&nova)),
            )
            .await;
            assert_eq!(cancelled.status, StatusCode::NO_CONTENT);
        }
    }

    let organiser_mails = count_after(
        &mails,
        3,
        to(
            "org@example.com",
            "nova asked to enter 1v1 Bgirl at Winter Cypher",
        ),
    )
    .await;
    assert_eq!(organiser_mails, 2);
}
