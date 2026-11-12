mod test_app;

use axum::{Router, http::StatusCode};
use breakingjam::auth::google::{self, Account, Profile};
use serde_json::json;
use sqlx::PgPool;
use test_app::{
    PASSWORD, TestResponse, app, app_with_mail, get, live_code, mail_with, post, send, sign_up,
};

async fn register(app: &Router, email: &str, password: &str) -> TestResponse {
    send(
        app,
        post(
            "/api/auth/register",
            json!({ "email": email, "password": password, "display_name": "Lil G" }),
            None,
        ),
    )
    .await
}

#[sqlx::test]
async fn register_mails_a_code_and_logs_in_only_once_it_is_confirmed(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;

    let body = json!({ "email": "lilg@example.com", "password": PASSWORD,
                       "display_name": "Lil G", "language": "fr" });
    let registered = send(&app, post("/api/auth/register", body, None)).await;
    assert_eq!(registered.status, StatusCode::ACCEPTED);
    assert_eq!(registered.json["email"], "lilg@example.com");
    assert!(
        registered.cookie("bj_session").is_none(),
        "no session before the code"
    );

    let code = live_code(&pool, "lilg@example.com", "verify_email")
        .await
        .unwrap();
    let mail = mail_with(&mails, |m| m["to"] == "lilg@example.com").await;
    assert_eq!(mail["subject"], format!("{code} est ton code BreakingJam"));
    assert!(mail["text"].as_str().unwrap().contains(&code));

    let body = json!({ "email": "LilG@example.com", "code": code });
    let verified = send(&app, post("/api/auth/email/verify", body, None)).await;
    assert_eq!(verified.status, StatusCode::OK);
    assert_eq!(verified.json["role"], "user");
    let set_cookie = verified.headers["set-cookie"].to_str().unwrap();
    assert!(set_cookie.contains("HttpOnly") && set_cookie.contains("SameSite=Lax"));

    let cookie = verified.cookie("bj_session").unwrap();
    let me = send(&app, get("/api/auth/me", Some(&cookie))).await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.json["email"], "lilg@example.com");
    assert_eq!(me.json["display_name"], "Lil G");
    assert!(me.cookie("bj_session").is_some(), "me refreshes the cookie");
}

#[sqlx::test]
async fn register_rejects_duplicate_email_ignoring_case(pool: PgPool) {
    let app = app(pool);
    register(&app, "lilg@example.com", PASSWORD).await;

    let duplicate = register(&app, "LilG@Example.com", "another one").await;
    assert_eq!(duplicate.status, StatusCode::CONFLICT);
    assert_eq!(duplicate.json["error"]["code"], "conflict");
}

#[sqlx::test]
async fn register_reports_every_invalid_field(pool: PgPool) {
    let response = send(
        &app(pool),
        post(
            "/api/auth/register",
            json!({ "email": "nope", "password": "short", "display_name": "   " }),
            None,
        ),
    )
    .await;

    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    let fields: Vec<&str> = response.json["error"]["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f["field"].as_str().unwrap())
        .collect();
    assert_eq!(fields, ["display_name", "email", "password"]);
}

#[sqlx::test]
async fn malformed_body_uses_the_error_envelope(pool: PgPool) {
    let response = send(
        &app(pool),
        post("/api/auth/login", json!({ "email": 1 }), None),
    )
    .await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response.json["error"]["fields"][0]["field"], "body");
}

#[sqlx::test]
async fn login_checks_the_password(pool: PgPool) {
    let app = app(pool.clone());
    sign_up(&app, &pool, "lilg@example.com").await;

    let wrong = json!({ "email": "lilg@example.com", "password": "wrong password" });
    let response = send(&app, post("/api/auth/login", wrong, None)).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);

    let unknown = json!({ "email": "nobody@example.com", "password": PASSWORD });
    let response = send(&app, post("/api/auth/login", unknown, None)).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);

    let right = json!({ "email": "LILG@example.com", "password": PASSWORD });
    let response = send(&app, post("/api/auth/login", right, None)).await;
    assert_eq!(response.status, StatusCode::OK);
    assert!(response.cookie("bj_session").is_some());
}

#[sqlx::test]
async fn login_to_an_unconfirmed_email_mails_a_new_code(pool: PgPool) {
    let (app, mails) = app_with_mail(pool.clone()).await;
    register(&app, "lilg@example.com", PASSWORD).await;
    // The sign-up code went out over a minute ago, so login may send another.
    sqlx::query!("update email_codes set sent_at = now() - interval '2 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    let first = live_code(&pool, "lilg@example.com", "verify_email").await;

    let wrong = json!({ "email": "lilg@example.com", "password": "wrong password" });
    let response = send(&app, post("/api/auth/login", wrong, None)).await;
    assert_eq!(
        response.status,
        StatusCode::UNAUTHORIZED,
        "the password comes first"
    );

    let right = json!({ "email": "lilg@example.com", "password": PASSWORD, "language": "de" });
    let response = send(&app, post("/api/auth/login", right, None)).await;
    assert_eq!(response.status, StatusCode::FORBIDDEN);
    assert_eq!(response.json["error"]["code"], "email_unverified");
    assert!(response.cookie("bj_session").is_none());

    let code = live_code(&pool, "lilg@example.com", "verify_email").await;
    assert_ne!(code, first, "a new code replaces the first");
    let subject = format!("{} ist dein BreakingJam-Code", code.unwrap());
    mail_with(&mails, |m| m["subject"] == subject).await;
}

#[sqlx::test]
async fn logout_ends_the_session(pool: PgPool) {
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "lilg@example.com").await;

    let logout = send(&app, post("/api/auth/logout", json!({}), Some(&cookie))).await;
    assert_eq!(logout.status, StatusCode::NO_CONTENT);
    assert_eq!(logout.cookie("bj_session").unwrap(), "bj_session=");

    let me = send(&app, get("/api/auth/me", Some(&cookie))).await;
    assert_eq!(me.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn me_rejects_missing_garbage_and_expired_sessions(pool: PgPool) {
    let app = app(pool.clone());
    let none = send(&app, get("/api/auth/me", None)).await;
    assert_eq!(none.status, StatusCode::UNAUTHORIZED);
    assert_eq!(none.json["error"]["code"], "unauthorized");

    let garbage = send(&app, get("/api/auth/me", Some("bj_session=not-a-uuid"))).await;
    assert_eq!(garbage.status, StatusCode::UNAUTHORIZED);

    let cookie = sign_up(&app, &pool, "lilg@example.com").await;
    sqlx::query!("update sessions set expires_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    let expired = send(&app, get("/api/auth/me", Some(&cookie))).await;
    assert_eq!(expired.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn google_start_redirects_with_pkce_and_flow_cookie(pool: PgPool) {
    let response = send(&app(pool), get("/api/auth/google?next=/org/jams/new", None)).await;

    assert_eq!(response.status, StatusCode::SEE_OTHER);
    let location = response.headers["location"].to_str().unwrap();
    assert!(location.starts_with("https://accounts.google.com/"));
    assert!(location.contains("code_challenge_method=S256"));
    assert!(response.cookie("bj_oauth").is_some());
}

#[sqlx::test]
async fn google_callback_with_wrong_state_goes_back_to_login(pool: PgPool) {
    let app = app(pool);
    let start = send(&app, get("/api/auth/google", None)).await;
    let flow = start.cookie("bj_oauth").unwrap();

    let callback = send(
        &app,
        get(
            "/api/auth/google/callback?code=abc&state=forged",
            Some(&flow),
        ),
    )
    .await;

    assert_eq!(callback.status, StatusCode::SEE_OTHER);
    assert_eq!(
        callback.headers["location"],
        "http://localhost:5173/login?error=google"
    );
    assert!(callback.cookie("bj_session").is_none());
}

fn profile(sub: &str, email: &str, email_verified: bool) -> Profile {
    Profile {
        sub: sub.into(),
        email: email.into(),
        email_verified,
        name: Some("Lil G".into()),
    }
}

#[sqlx::test]
async fn google_creates_then_finds_by_subject(pool: PgPool) {
    let Account::New(created) =
        google::find_or_create_user(&pool, &profile("g-1", "lilg@gmail.com", true))
            .await
            .unwrap()
    else {
        panic!("the first sign-in creates the account");
    };
    // Same Google account with a changed email still resolves to the same user.
    let Account::Existing(again) =
        google::find_or_create_user(&pool, &profile("g-1", "new@gmail.com", true))
            .await
            .unwrap()
    else {
        panic!("the second finds it");
    };
    assert_eq!(created.id, again.id);
}

#[sqlx::test]
async fn google_takes_over_an_unverified_password_account(pool: PgPool) {
    // Someone registers the address first, hoping the owner later signs in with Google.
    let app = app(pool.clone());
    register(&app, "lilg@gmail.com", "squatter pass").await;

    let Account::Existing(user) =
        google::find_or_create_user(&pool, &profile("g-1", "lilg@gmail.com", true))
            .await
            .unwrap()
    else {
        panic!("the registered address is linked, not duplicated");
    };

    let row = sqlx::query!(
        r#"select google_sub, password_hash, email_verified_at is not null as "verified!"
           from app_users where id = $1"#,
        user.id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(row.google_sub.as_deref(), Some("g-1"));
    assert!(
        row.password_hash.is_none(),
        "squatter's password is dropped"
    );
    assert!(row.verified);

    // The account is Google-only now: no password logs into it.
    let login = json!({ "email": "lilg@gmail.com", "password": "squatter pass" });
    let response = send(&app, post("/api/auth/login", login, None)).await;
    assert_eq!(response.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test]
async fn google_unverified_email_creates_an_unverified_account(pool: PgPool) {
    let Account::New(user) =
        google::find_or_create_user(&pool, &profile("g-1", "lilg@gmail.com", false))
            .await
            .unwrap()
    else {
        panic!("an unknown address makes a new account");
    };

    let verified = sqlx::query_scalar!(
        r#"select email_verified_at is not null as "verified!" from app_users where id = $1"#,
        user.id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!verified, "only Google's word verifies an email");
}

#[sqlx::test]
async fn google_does_not_link_an_unverified_google_email(pool: PgPool) {
    let app = app(pool.clone());
    register(&app, "lilg@gmail.com", PASSWORD).await;

    let result = google::find_or_create_user(&pool, &profile("g-1", "lilg@gmail.com", false)).await;
    assert!(
        result.is_err(),
        "email is taken and Google did not verify it"
    );
}
