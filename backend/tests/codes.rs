mod test_app;

use axum::{Router, http::StatusCode};
use breakingjam::auth::google::{self, Profile};
use serde_json::json;
use sqlx::PgPool;
use test_app::{
    PASSWORD, TestResponse, app, app_with_mail, get, live_code, mail_with, post, send, sign_up,
};

const EMAIL: &str = "lilg@example.com";

/// A password account whose email is not confirmed yet.
async fn register(app: &Router) {
    let body = json!({ "email": EMAIL, "password": PASSWORD, "display_name": "Lil G" });
    let response = send(app, post("/api/auth/register", body, None)).await;
    assert_eq!(response.status, StatusCode::ACCEPTED);
}

async fn verify(app: &Router, code: &str) -> TestResponse {
    let body = json!({ "email": EMAIL, "code": code });
    send(app, post("/api/auth/email/verify", body, None)).await
}

/// A well-formed code that is not `code`.
fn other_than(code: &str) -> &'static str {
    if code == "000000" { "111111" } else { "000000" }
}

/// Lets the next code go out: the last one was sent over a minute ago.
async fn a_minute_later(pool: &PgPool) {
    sqlx::query!("update email_codes set sent_at = now() - interval '2 minutes'")
        .execute(pool)
        .await
        .unwrap();
}

fn assert_wrong_code(response: &TestResponse) {
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response.json["error"]["fields"][0]["field"], "code");
}

#[sqlx::test]
async fn five_wrong_tries_spend_the_code(pool: PgPool) {
    let app = app(pool.clone());
    register(&app).await;
    let code = live_code(&pool, EMAIL, "verify_email").await.unwrap();

    for _ in 0..5 {
        assert_wrong_code(&verify(&app, other_than(&code)).await);
    }
    assert_wrong_code(&verify(&app, &code).await);
}

#[sqlx::test]
async fn guesses_at_once_still_count_one_by_one(pool: PgPool) {
    let app = app(pool.clone());
    register(&app).await;
    let code = live_code(&pool, EMAIL, "verify_email").await.unwrap();

    let guesses: Vec<_> = (0..8)
        .map(|_| {
            let (app, wrong) = (app.clone(), other_than(&code));
            tokio::spawn(async move { verify(&app, wrong).await.status })
        })
        .collect();
    for guess in guesses {
        assert_eq!(guess.await.unwrap(), StatusCode::UNPROCESSABLE_ENTITY);
    }
    assert_wrong_code(&verify(&app, &code).await);
}

#[sqlx::test]
async fn an_expired_code_is_refused(pool: PgPool) {
    let app = app(pool.clone());
    register(&app).await;
    let code = live_code(&pool, EMAIL, "verify_email").await.unwrap();
    sqlx::query!("update email_codes set expires_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();

    assert_wrong_code(&verify(&app, &code).await);
}

#[sqlx::test]
async fn an_unknown_email_looks_like_a_wrong_code(pool: PgPool) {
    let body = json!({ "email": "nobody@example.com", "code": "123456" });
    assert_wrong_code(&send(&app(pool), post("/api/auth/email/verify", body, None)).await);
}

#[sqlx::test]
async fn resend_waits_a_minute_between_codes(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    register(&app).await;
    let first = live_code(&pool, EMAIL, "verify_email").await;

    let resend = json!({ "email": EMAIL, "language": "en" });
    let response = send(&app, post("/api/auth/email/resend", resend.clone(), None)).await;
    assert_eq!(response.status, StatusCode::NO_CONTENT);
    assert_eq!(live_code(&pool, EMAIL, "verify_email").await, first);

    a_minute_later(&pool).await;
    let response = send(&app, post("/api/auth/email/resend", resend, None)).await;
    assert_eq!(response.status, StatusCode::NO_CONTENT);
    let second = live_code(&pool, EMAIL, "verify_email").await.unwrap();
    assert_ne!(Some(&second), first.as_ref());
    let subject = format!("{second} is your BreakingJam code");
    mail_with(&mails, |m| m["subject"] == subject).await;

    assert_eq!(verify(&app, &second).await.status, StatusCode::OK);
}

#[sqlx::test]
async fn ten_codes_a_day_at_most(pool: PgPool) {
    let app = app(pool.clone());
    register(&app).await;
    let resend = json!({ "email": EMAIL });
    let mut sent = Vec::new();
    for _ in 0..11 {
        a_minute_later(&pool).await;
        send(&app, post("/api/auth/email/resend", resend.clone(), None)).await;
        sent.push(live_code(&pool, EMAIL, "verify_email").await.unwrap());
    }
    // The sign-up code and 9 resends; the 11th asks for one more than 10.
    assert_ne!(sent[8], sent[7]);
    assert_eq!(sent[9], sent[8], "the 11th code of the day is not sent");

    sqlx::query!("update email_codes set day_started_at = now() - interval '25 hours'")
        .execute(&pool)
        .await
        .unwrap();
    a_minute_later(&pool).await;
    send(&app, post("/api/auth/email/resend", resend, None)).await;
    let next_day = live_code(&pool, EMAIL, "verify_email").await.unwrap();
    assert_ne!(next_day, sent[9], "a new day, a new code");
}

#[sqlx::test]
async fn resend_sends_nothing_to_a_confirmed_or_unknown_email(pool: PgPool) {
    let app = app(pool.clone());
    sign_up(&app, &pool, EMAIL).await;

    for email in [EMAIL, "nobody@example.com"] {
        let body = json!({ "email": email });
        let response = send(&app, post("/api/auth/email/resend", body, None)).await;
        assert_eq!(response.status, StatusCode::NO_CONTENT);
    }
    let codes = sqlx::query_scalar!(r#"select count(*) as "n!" from email_codes"#)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(codes, 0);
}

#[sqlx::test]
async fn forgot_sends_nothing_to_an_unknown_email(pool: PgPool) {
    let body = json!({ "email": "nobody@example.com" });
    let response = send(
        &app(pool.clone()),
        post("/api/auth/password/forgot", body, None),
    )
    .await;
    assert_eq!(response.status, StatusCode::NO_CONTENT);
    assert_eq!(
        live_code(&pool, "nobody@example.com", "reset_password").await,
        None
    );
}

#[sqlx::test]
async fn reset_changes_the_password_and_ends_every_session(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    let old_session = sign_up(&app, &pool, EMAIL).await;

    let forgot = json!({ "email": "LilG@example.com", "language": "de" });
    let response = send(&app, post("/api/auth/password/forgot", forgot, None)).await;
    assert_eq!(response.status, StatusCode::NO_CONTENT);
    let code = live_code(&pool, EMAIL, "reset_password").await.unwrap();
    let mail = mail_with(&mails, |m| {
        m["subject"] == format!("{code} ist dein BreakingJam-Code")
    })
    .await;
    assert!(
        mail["text"]
            .as_str()
            .unwrap()
            .contains("neues BreakingJam-Passwort")
    );

    let short = json!({ "email": EMAIL, "code": code, "password": "short" });
    let response = send(&app, post("/api/auth/password/reset", short, None)).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response.json["error"]["fields"][0]["field"], "password");

    let reset = json!({ "email": EMAIL, "code": code, "password": "a new password" });
    let response = send(&app, post("/api/auth/password/reset", reset.clone(), None)).await;
    assert_eq!(response.status, StatusCode::OK);
    assert_eq!(response.json["email"], EMAIL);
    let new_session = response.cookie("bj_session").unwrap();

    let me = send(&app, get("/api/auth/me", Some(&old_session))).await;
    assert_eq!(me.status, StatusCode::UNAUTHORIZED, "the old session ended");
    let me = send(&app, get("/api/auth/me", Some(&new_session))).await;
    assert_eq!(me.status, StatusCode::OK);

    let login = |password: &str| json!({ "email": EMAIL, "password": password });
    let response = send(&app, post("/api/auth/login", login(PASSWORD), None)).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
    let response = send(&app, post("/api/auth/login", login("a new password"), None)).await;
    assert_eq!(response.status, StatusCode::OK);

    let again = send(&app, post("/api/auth/password/reset", reset, None)).await;
    assert_wrong_code(&again);
}

#[sqlx::test]
async fn reset_also_confirms_the_email(pool: PgPool) {
    let app = app(pool.clone());
    register(&app).await;

    let forgot = json!({ "email": EMAIL });
    send(&app, post("/api/auth/password/forgot", forgot, None)).await;
    let code = live_code(&pool, EMAIL, "reset_password").await.unwrap();
    let reset = json!({ "email": EMAIL, "code": code, "password": "a new password" });
    let response = send(&app, post("/api/auth/password/reset", reset, None)).await;
    assert_eq!(response.status, StatusCode::OK);

    assert_eq!(
        live_code(&pool, EMAIL, "verify_email").await,
        None,
        "codes are gone"
    );
    let login = json!({ "email": EMAIL, "password": "a new password" });
    let response = send(&app, post("/api/auth/login", login, None)).await;
    assert_eq!(response.status, StatusCode::OK);
}

/// Whether the account of `EMAIL` is still linked to a Google account.
async fn google_linked(pool: &PgPool) -> bool {
    sqlx::query_scalar!(
        r#"select google_sub is not null as "linked!" from app_users where email = $1"#,
        EMAIL
    )
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test]
async fn a_code_takes_the_address_from_an_unproved_google_link(pool: PgPool) {
    // Someone whose Google account claims the address without Google vouching for it.
    let profile = Profile {
        sub: "g-1".into(),
        email: EMAIL.into(),
        email_verified: false,
        name: Some("Not Lil G".into()),
    };
    google::find_or_create_user(&pool, &profile).await.unwrap();
    let app = app(pool.clone());

    let resend = json!({ "email": EMAIL });
    send(&app, post("/api/auth/email/resend", resend, None)).await;
    let code = live_code(&pool, EMAIL, "verify_email").await.unwrap();
    assert_eq!(verify(&app, &code).await.status, StatusCode::OK);
    assert!(
        !google_linked(&pool).await,
        "the code's reader holds it alone"
    );
}

#[sqlx::test]
async fn a_reset_takes_the_address_from_an_unproved_google_link(pool: PgPool) {
    let profile = Profile {
        sub: "g-1".into(),
        email: EMAIL.into(),
        email_verified: false,
        name: None,
    };
    google::find_or_create_user(&pool, &profile).await.unwrap();
    let app = app(pool.clone());

    send(
        &app,
        post("/api/auth/password/forgot", json!({ "email": EMAIL }), None),
    )
    .await;
    let code = live_code(&pool, EMAIL, "reset_password").await.unwrap();
    let reset = json!({ "email": EMAIL, "code": code, "password": "a new password" });
    let response = send(&app, post("/api/auth/password/reset", reset, None)).await;
    assert_eq!(response.status, StatusCode::OK);
    assert!(!google_linked(&pool).await);
}

#[sqlx::test]
async fn a_reset_keeps_a_proved_google_link(pool: PgPool) {
    let profile = Profile {
        sub: "g-1".into(),
        email: EMAIL.into(),
        email_verified: true,
        name: None,
    };
    google::find_or_create_user(&pool, &profile).await.unwrap();
    let app = app(pool.clone());

    send(
        &app,
        post("/api/auth/password/forgot", json!({ "email": EMAIL }), None),
    )
    .await;
    let code = live_code(&pool, EMAIL, "reset_password").await.unwrap();
    let reset = json!({ "email": EMAIL, "code": code, "password": "a new password" });
    let response = send(&app, post("/api/auth/password/reset", reset, None)).await;
    assert_eq!(response.status, StatusCode::OK);
    assert!(
        google_linked(&pool).await,
        "a Google-only account may add a password"
    );
}
