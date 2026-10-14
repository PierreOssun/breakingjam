//! Session cookie and the `CurrentUser` / `MaybeUser` extractors.

use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts},
    http::{HeaderMap, HeaderValue, request::Parts},
};
use uuid::Uuid;

use crate::{
    db,
    domain::user::{Role, User},
    error::AppError,
    state::AppState,
};

const COOKIE: &str = "bj_session";
const TTL_DAYS: i32 = 30;
const TTL_SECONDS: u32 = TTL_DAYS as u32 * 24 * 60 * 60;

/// The logged-in user; rejects with 401 when there is no valid session.
#[derive(Debug, Clone)]
pub struct CurrentUser {
    /// The account behind the session.
    pub user: User,
    /// The session row, so handlers can extend or end it.
    pub session_id: Uuid,
}

/// The logged-in user, if any; never rejects for a missing session.
pub type MaybeUser = Option<CurrentUser>;

impl CurrentUser {
    /// 403 unless the user has at least `role`.
    pub fn require(&self, role: Role) -> Result<(), AppError> {
        if self.user.role >= role {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        <Self as OptionalFromRequestParts<AppState>>::from_request_parts(parts, state)
            .await?
            .ok_or(AppError::Unauthorized)
    }
}

impl OptionalFromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Option<Self>, AppError> {
        let Some(session_id) = session_id(&parts.headers) else {
            return Ok(None);
        };
        let user = db::sessions::find_user(&state.pool, session_id).await?;
        Ok(user.map(|user| Self { user, session_id }))
    }
}

/// Session id from the request cookie, if present and well-formed.
pub fn session_id(headers: &HeaderMap) -> Option<Uuid> {
    super::read_cookie(headers, COOKIE)?.parse().ok()
}

/// Opens a session for `user_id`; returns the `Set-Cookie` value.
pub async fn start(state: &AppState, user_id: Uuid) -> Result<HeaderValue, AppError> {
    let id = db::sessions::create(&state.pool, user_id, TTL_DAYS).await?;
    cookie(state, id)
}

/// Slides the expiry 30 days forward; returns the refreshed `Set-Cookie` value.
pub async fn extend(state: &AppState, session_id: Uuid) -> Result<HeaderValue, AppError> {
    db::sessions::extend(&state.pool, session_id, TTL_DAYS).await?;
    cookie(state, session_id)
}

fn cookie(state: &AppState, session_id: Uuid) -> Result<HeaderValue, AppError> {
    super::cookie(
        COOKIE,
        &session_id.to_string(),
        TTL_SECONDS,
        state.config.secure_cookies(),
    )
}

/// `Set-Cookie` value that deletes the session cookie.
pub fn clear(state: &AppState) -> Result<HeaderValue, AppError> {
    super::cookie(COOKIE, "", 0, state.config.secure_cookies())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn current(role: Role) -> CurrentUser {
        CurrentUser {
            user: User {
                id: Uuid::nil(),
                email: "a@b.c".into(),
                display_name: "A".into(),
                role,
            },
            session_id: Uuid::nil(),
        }
    }

    #[test]
    fn require_passes_for_higher_roles() {
        assert!(current(Role::Admin).require(Role::Organizer).is_ok());
        assert!(current(Role::Organizer).require(Role::Organizer).is_ok());
        assert!(matches!(
            current(Role::User).require(Role::Organizer),
            Err(AppError::Forbidden)
        ));
    }
}
