//! Admin-only actions besides claims: merging duplicate dancers and changing roles.

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{post, put},
};
use serde::Deserialize;
use sqlx::PgConnection;
use uuid::Uuid;
use validator::Validate;

use super::{auth::UserResponse, json::ValidJson};
use crate::{
    auth::session::CurrentUser,
    db,
    domain::{
        dancer::{Dancer, merged_aliases},
        user::Role,
    },
    error::AppError,
    state::AppState,
};

/// `/admin/*` routes other than claims.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/dancers/{id}/merge", post(merge))
        .route("/admin/users/{id}/role", put(set_role))
}

/// Body of `POST /admin/dancers/{id}/merge`.
#[derive(Debug, Deserialize, Validate)]
pub struct MergeRequest {
    /// The surviving dancer; `{id}` becomes a redirect to it.
    pub into: Uuid,
}

/// Body of `PUT /admin/users/{id}/role`.
#[derive(Debug, Deserialize, Validate)]
pub struct RoleRequest {
    pub role: Role,
}

/// Result of a merge: the survivor that now carries everything.
#[derive(Debug, serde::Serialize)]
pub struct MergeResponse {
    pub merged_into: Uuid,
    pub aliases: Vec<String>,
    pub instagram_handle: Option<String>,
}

async fn merge(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(req): ValidJson<MergeRequest>,
) -> Result<Json<MergeResponse>, AppError> {
    current.require(Role::Admin)?;
    if id == req.into {
        return Err(AppError::invalid(
            "into",
            "cannot merge a dancer into itself",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let (loser, survivor) = lock_pair(&mut tx, id, req.into).await?;
    if loser.merged_into_id.is_some() || survivor.merged_into_id.is_some() {
        return Err(AppError::Conflict(
            "one of these dancers is already merged".into(),
        ));
    }
    // Ownership is bound to the account; moving it silently would surprise the owner.
    if loser.verified_at.is_some() {
        return Err(AppError::Conflict(
            "cannot merge away a verified dancer; merge the other one into it".into(),
        ));
    }
    let aliases = merged_aliases(&survivor, &loser);
    db::dancers::merge(&mut tx, &loser, &survivor, &aliases).await?;
    tx.commit().await?;
    Ok(Json(MergeResponse {
        merged_into: survivor.id,
        aliases,
        instagram_handle: survivor.instagram_handle.or(loser.instagram_handle),
    }))
}

/// Locks `(loser, survivor)` in id order so two opposite merges can't deadlock.
async fn lock_pair(
    conn: &mut PgConnection,
    loser: Uuid,
    survivor: Uuid,
) -> Result<(Dancer, Dancer), AppError> {
    let first = db::dancers::find_for_update(&mut *conn, loser.min(survivor)).await?;
    let second = db::dancers::find_for_update(&mut *conn, loser.max(survivor)).await?;
    let (loser, survivor) = if loser < survivor {
        (first, second)
    } else {
        (second, first)
    };
    Ok((
        loser.ok_or(AppError::NotFound)?,
        survivor.ok_or_else(|| AppError::invalid("into", "unknown dancer"))?,
    ))
}

async fn set_role(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(req): ValidJson<RoleRequest>,
) -> Result<Json<UserResponse>, AppError> {
    current.require(Role::Admin)?;
    // Keeps the last admin from locking everyone out by demoting themselves.
    if id == current.user.id {
        return Err(AppError::invalid("role", "you cannot change your own role"));
    }
    let user = db::users::set_role(&state.pool, id, req.role).await?;
    Ok(Json(user.into()))
}
