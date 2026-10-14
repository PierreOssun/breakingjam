//! `/auth`: register, login, logout, me, Google sign-in.

use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header::SET_COOKIE},
    response::{AppendHeaders, IntoResponse, Redirect, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::json::ValidJson;
use crate::{
    auth::{
        google, password,
        session::{self, CurrentUser},
    },
    db,
    domain::user::{Role, User},
    error::AppError,
    state::AppState,
};

/// `/auth/*` routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me))
        .route("/auth/google", get(google_start))
        .route("/auth/google/callback", get(google_callback))
}

/// Body of `POST /auth/register`.
#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    /// Login email; unique, case-insensitive.
    #[validate(email(message = "must be a valid email address"))]
    pub email: String,
    /// Plain password, 8 to 128 characters.
    #[validate(length(min = 8, max = 128, message = "must be 8 to 128 characters"))]
    pub password: String,
    /// Public name, at most 80 characters.
    #[validate(
        length(max = 80, message = "must be at most 80 characters"),
        custom(function = "crate::domain::not_blank")
    )]
    pub display_name: String,
}

/// Body of `POST /auth/login`.
#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    /// Login email, case-insensitive.
    pub email: String,
    /// Plain password.
    pub password: String,
}

/// The logged-in account, as returned by register, login and me.
#[derive(Debug, Serialize)]
pub struct UserResponse {
    /// Account id.
    pub id: Uuid,
    /// Login email.
    pub email: String,
    /// Public name.
    pub display_name: String,
    /// Account role, snake_case.
    pub role: Role,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            role: user.role,
        }
    }
}

/// Query of `GET /auth/google`.
#[derive(Debug, Deserialize)]
pub struct GoogleStartQuery {
    /// Same-site path to land on after sign-in.
    pub next: Option<String>,
}

/// Query Google sends back to the callback.
#[derive(Debug, Deserialize)]
pub struct GoogleCallbackQuery {
    /// Authorization code; absent when the user cancelled.
    pub code: Option<String>,
    /// CSRF state echoed back by Google.
    pub state: Option<String>,
}

type WithCookie<T> = ([(axum::http::HeaderName, HeaderValue); 1], T);

async fn register(
    State(state): State<AppState>,
    ValidJson(req): ValidJson<RegisterRequest>,
) -> Result<(StatusCode, WithCookie<Json<UserResponse>>), AppError> {
    let hash = password::hash(req.password).await?;
    let user = db::users::insert_with_password(
        &state.pool,
        req.email.trim(),
        req.display_name.trim(),
        &hash,
    )
    .await?;
    let cookie = session::start(&state, user.id).await?;
    Ok((
        StatusCode::CREATED,
        ([(SET_COOKIE, cookie)], Json(user.into())),
    ))
}

async fn login(
    State(state): State<AppState>,
    ValidJson(req): ValidJson<LoginRequest>,
) -> Result<WithCookie<Json<UserResponse>>, AppError> {
    // Unknown email, Google-only account and wrong password all look the same to the client.
    let (user, hash) = db::users::find_with_password(&state.pool, req.email.trim())
        .await?
        .ok_or(AppError::Unauthorized)?;
    let hash = hash.ok_or(AppError::Unauthorized)?;
    if !password::verify(req.password, hash).await? {
        return Err(AppError::Unauthorized);
    }
    let cookie = session::start(&state, user.id).await?;
    Ok(([(SET_COOKIE, cookie)], Json(user.into())))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, WithCookie<()>), AppError> {
    if let Some(id) = session::session_id(&headers) {
        db::sessions::delete(&state.pool, id).await?;
    }
    Ok((
        StatusCode::NO_CONTENT,
        ([(SET_COOKIE, session::clear(&state)?)], ()),
    ))
}

async fn me(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<WithCookie<Json<UserResponse>>, AppError> {
    // The frontend calls `me` on every load, which makes the 30-day session rolling.
    let cookie = session::extend(&state, current.session_id).await?;
    Ok(([(SET_COOKIE, cookie)], Json(current.user.into())))
}

async fn google_start(
    State(state): State<AppState>,
    Query(query): Query<GoogleStartQuery>,
) -> Result<WithCookie<Redirect>, AppError> {
    let next = safe_next(query.next.as_deref());
    let (url, cookie) = google::authorize(&state.config, next)?;
    Ok(([(SET_COOKIE, cookie)], Redirect::to(&url)))
}

async fn google_callback(
    State(state): State<AppState>,
    Query(query): Query<GoogleCallbackQuery>,
    headers: HeaderMap,
) -> Response {
    finish_google(&state, query, &headers)
        .await
        .unwrap_or_else(|err| {
            tracing::warn!(error = %err, "google sign-in failed");
            let login = format!("{}/login?error=google", state.config.frontend_origin);
            Redirect::to(&login).into_response()
        })
}

async fn finish_google(
    state: &AppState,
    query: GoogleCallbackQuery,
    headers: &HeaderMap,
) -> Result<Response, AppError> {
    let pending = google::pending(headers).ok_or(AppError::Unauthorized)?;
    // Missing code (user cancelled) or a state mismatch (CSRF) both end here.
    let code = query
        .code
        .filter(|_| query.state.as_deref() == Some(pending.state.as_str()))
        .ok_or(AppError::Unauthorized)?;
    let profile = google::exchange(&state.config, &state.http, code, pending.verifier).await?;
    let user = google::find_or_create_user(&state.pool, &profile).await?;
    let session_cookie = session::start(state, user.id).await?;
    // Two `Set-Cookie` headers: a plain array would `insert` and keep only the last one.
    let cookies = AppendHeaders([
        (SET_COOKIE, session_cookie),
        (SET_COOKIE, google::clear(&state.config)?),
    ]);
    let next = safe_next(Some(&pending.next));
    let target = format!("{}{next}", state.config.frontend_origin);
    Ok((cookies, Redirect::to(&target)).into_response())
}

/// Only same-site paths: `/x` yes, `//evil.com` and `https://evil.com` no.
fn safe_next(next: Option<&str>) -> &str {
    match next {
        Some(path)
            if path.starts_with('/')
                && !path.starts_with("//")
                && !path.contains('\\')
                // Control characters cannot go in a `Location` header.
                && !path.chars().any(char::is_control) =>
        {
            path
        }
        _ => "/",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_next_rejects_other_origins() {
        assert_eq!(safe_next(Some("/org/jams/new")), "/org/jams/new");
        assert_eq!(safe_next(Some("//evil.com")), "/");
        assert_eq!(safe_next(Some("https://evil.com")), "/");
        assert_eq!(safe_next(Some("/\\evil.com")), "/");
        assert_eq!(safe_next(Some("/jams\nSet-Cookie: x=1")), "/");
        assert_eq!(safe_next(None), "/");
    }
}
