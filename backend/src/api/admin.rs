//! Admin-only tools besides claims and jam reviews: the overview, merging duplicate dancers and
//! changing roles.

use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use sqlx::PgConnection;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;
use validator::Validate;

use super::{auth::UserResponse, json::ValidJson};
use crate::{
    auth::session::CurrentUser,
    db::{self, stats::Stats},
    domain::{
        dancer::{Dancer, merged_aliases},
        user::Role,
    },
    error::{AppError, ErrorEnvelope, NotAdmin, Unauthorized},
    state::AppState,
};

/// `/admin/*` routes other than claims.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(stats))
        .routes(routes!(merge))
        .routes(routes!(set_role))
}

/// Body of `POST /admin/dancers/{id}/merge`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct MergeRequest {
    /// The surviving dancer; `{id}` becomes a redirect to it.
    pub into: Uuid,
}

/// Body of `PUT /admin/users/{id}/role`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RoleRequest {
    /// The new role.
    pub role: Role,
}

/// Result of a merge: the survivor that now carries everything.
#[derive(Debug, serde::Serialize, ToSchema)]
pub struct MergeResponse {
    /// The survivor's id.
    pub merged_into: Uuid,
    /// The survivor's aliases, now including the loser's names.
    pub aliases: Vec<String>,
    /// The survivor's handle, taken from the loser when it had none.
    pub instagram_handle: Option<String>,
}

/// The admin overview: what the site holds and what waits for review.
#[utoipa::path(
    get,
    path = "/admin/stats",
    tag = "admin",
    operation_id = "admin_stats",
    security(("session" = [])),
    responses(
        (status = OK, body = Stats),
        Unauthorized,
        NotAdmin,
    )
)]
async fn stats(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Stats>, AppError> {
    current.require(Role::Admin)?;
    Ok(Json(db::stats::overview(&state.pool).await?))
}

/// Merge a duplicate into `into`; `{id}` becomes a redirect.
#[utoipa::path(
    post,
    path = "/admin/dancers/{id}/merge",
    tag = "admin",
    operation_id = "merge_dancers",
    params(("id" = Uuid, Path, description = "Dancer to merge away")),
    request_body = MergeRequest,
    security(("session" = [])),
    responses(
        (status = OK, body = MergeResponse),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such dancer", body = ErrorEnvelope),
        (status = CONFLICT, description = "Already merged, or `{id}` is verified", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "`into` is `{id}` or unknown", body = ErrorEnvelope),
    )
)]
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

/// Change an account's role (not your own).
#[utoipa::path(
    put,
    path = "/admin/users/{id}/role",
    tag = "admin",
    operation_id = "set_user_role",
    params(("id" = Uuid, Path, description = "User id")),
    request_body = RoleRequest,
    security(("session" = [])),
    responses(
        (status = OK, body = UserResponse),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such user", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Your own role", body = ErrorEnvelope),
    )
)]
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
    Ok(Json(UserResponse::load(&state.pool, user).await?))
}
