//! `/auth/email/*` and `/auth/password/*`: the 6-digit codes that confirm an email and reset a
//! password (M27).

use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;
use sqlx::{PgConnection, PgPool};
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;
use validator::Validate;

use super::{
    auth::{UserResponse, WithCookie, log_in},
    extract::ValidJson,
};
use crate::{
    auth::password,
    db,
    domain::user::{CodePurpose, User, random_code},
    error::{AppError, Busy, InvalidFields},
    mail::{Language, Message},
    state::AppState,
};

/// The code routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(verify_email))
        .routes(routes!(resend_code))
        .routes(routes!(forgot_password))
        .routes(routes!(reset_password))
}

/// Body of `POST /auth/email/verify`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct VerifyEmailRequest {
    /// Login email, case-insensitive.
    pub email: String,
    /// The 6 digits mailed to it.
    pub code: String,
}

/// Body of `POST /auth/email/resend` and `POST /auth/password/forgot`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct SendCodeRequest {
    /// Login email, case-insensitive.
    pub email: String,
    /// Language of the email; English when absent.
    #[serde(default)]
    pub language: Language,
}

/// Body of `POST /auth/password/reset`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct ResetPasswordRequest {
    /// Login email, case-insensitive.
    pub email: String,
    /// The 6 digits mailed to it.
    pub code: String,
    /// New plain password, 8 to 128 characters.
    #[validate(length(min = 8, max = 128, message = "must be 8 to 128 characters"))]
    pub password: String,
}

/// Confirm the email with the code mailed at sign-up or login, and log in.
#[utoipa::path(
    post,
    path = "/auth/email/verify",
    tag = "auth",
    operation_id = "verify_email",
    request_body = VerifyEmailRequest,
    responses(
        (status = OK, body = UserResponse, headers(("set-cookie" = String, description = "`bj_session`, HttpOnly, 30 days"))),
        (status = UNPROCESSABLE_ENTITY, description = "Wrong, expired or used-up code (field `code`), or an unknown email", body = crate::error::ErrorEnvelope),
    )
)]
async fn verify_email(
    State(state): State<AppState>,
    ValidJson(req): ValidJson<VerifyEmailRequest>,
) -> Result<WithCookie<Json<UserResponse>>, AppError> {
    let user = redeem_code(&state.pool, &req.email, CodePurpose::VerifyEmail, &req.code).await?;
    let mut tx = state.pool.begin().await?;
    take_over(&mut tx, user.id).await?;
    tx.commit().await?;
    log_in(&state, user).await
}

/// Mail a new sign-up code to an account whose email is not confirmed yet.
#[utoipa::path(
    post,
    path = "/auth/email/resend",
    tag = "auth",
    operation_id = "resend_code",
    request_body = SendCodeRequest,
    responses(
        (status = NO_CONTENT, description = "Always, so the answer says nothing about the account; nothing is sent to a confirmed or unknown email, or within a minute of the last code"),
        InvalidFields,
    )
)]
async fn resend_code(
    State(state): State<AppState>,
    ValidJson(req): ValidJson<SendCodeRequest>,
) -> Result<StatusCode, AppError> {
    let found = db::users::find_credentials(&state.pool, req.email.trim()).await?;
    if let Some(account) = found.filter(|account| !account.email_verified) {
        send_code(
            &state,
            &account.user,
            CodePurpose::VerifyEmail,
            req.language,
        )
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Mail a code to choose a new password.
#[utoipa::path(
    post,
    path = "/auth/password/forgot",
    tag = "auth",
    operation_id = "forgot_password",
    request_body = SendCodeRequest,
    responses(
        (status = NO_CONTENT, description = "Always, so the answer says nothing about the account; nothing is sent to an unknown email, or within a minute of the last code"),
        InvalidFields,
    )
)]
async fn forgot_password(
    State(state): State<AppState>,
    ValidJson(req): ValidJson<SendCodeRequest>,
) -> Result<StatusCode, AppError> {
    // A Google-only account may use it too, to add a password.
    if let Some(account) = db::users::find_credentials(&state.pool, req.email.trim()).await? {
        send_code(
            &state,
            &account.user,
            CodePurpose::ResetPassword,
            req.language,
        )
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Choose a new password with the code mailed by `forgot`, and log in; every other session ends.
#[utoipa::path(
    post,
    path = "/auth/password/reset",
    tag = "auth",
    operation_id = "reset_password",
    request_body = ResetPasswordRequest,
    responses(
        (status = OK, body = UserResponse, headers(("set-cookie" = String, description = "`bj_session`, HttpOnly, 30 days"))),
        (status = UNPROCESSABLE_ENTITY, description = "Wrong, expired or used-up code (field `code`), an unknown email, or a bad password", body = crate::error::ErrorEnvelope),
        Busy,
    )
)]
async fn reset_password(
    State(state): State<AppState>,
    ValidJson(req): ValidJson<ResetPasswordRequest>,
) -> Result<WithCookie<Json<UserResponse>>, AppError> {
    let user = redeem_code(
        &state.pool,
        &req.email,
        CodePurpose::ResetPassword,
        &req.code,
    )
    .await?;
    let hash = password::hash(req.password, &state.config.password_pepper).await?;
    let mut tx = state.pool.begin().await?;
    take_over(&mut tx, user.id).await?;
    db::users::set_password(&mut tx, user.id, &hash).await?;
    tx.commit().await?;
    log_in(&state, user).await
}

/// Mails `user` a new code for `purpose`, unless one went out less than a minute ago.
pub(super) async fn send_code(
    state: &AppState,
    user: &User,
    purpose: CodePurpose,
    language: Language,
) -> Result<(), AppError> {
    let code = random_code();
    if !db::email_codes::issue(&state.pool, user.id, purpose, &code).await? {
        return Ok(());
    }
    let message = Message::code(purpose, language, &user.email, &code);
    let mail = state.mail.clone();
    // In the background: a slow mail service must not hold the request, nor show in its timing.
    tokio::spawn(async move {
        if let Err(error) = mail.send(&message).await {
            tracing::warn!(error = %error, "could not send a code email");
        }
    });
    Ok(())
}

/// Hands the account to whoever just read a code sent to its email: the email is proved, and
/// every session and other code ends (the old password's, or a Google sign-in's on an
/// address nobody had proved).
async fn take_over(tx: &mut PgConnection, user_id: Uuid) -> sqlx::Result<()> {
    db::users::mark_email_verified(tx, user_id).await?;
    db::sessions::delete_for_user(tx, user_id).await?;
    db::email_codes::delete_for_user(tx, user_id).await
}

/// The account behind `email` once its `code` for `purpose` is spent; a 422 on `code` otherwise.
async fn redeem_code(
    pool: &PgPool,
    email: &str,
    purpose: CodePurpose,
    code: &str,
) -> Result<User, AppError> {
    // An unknown email gets the same answer as a wrong code.
    let wrong = || AppError::invalid("code", "is wrong or has expired");
    let user = db::users::find_credentials(pool, email.trim())
        .await?
        .ok_or_else(wrong)?
        .user;
    let matched = db::email_codes::redeem(pool, user.id, purpose, code.trim()).await?;
    matched.then_some(user).ok_or_else(wrong)
}
