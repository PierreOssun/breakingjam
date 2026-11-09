//! Admin-only tools besides claims and jam reviews: the overview, the accounts, merging duplicate
//! dancers and managing the team.

use axum::{Json, extract::State};
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;
use validator::Validate;

use super::{
    auth::UserResponse,
    extract::{Path, Query, ValidJson},
    page::{self, Page},
    transaction,
};
use crate::{
    auth::session::CurrentUser,
    db::dancers::MergeLock,
    db::{self, stats::Stats},
    domain::{
        admin_action::Logged,
        user::{AccountRow, AccountView, Role, TeamRole},
    },
    error::{AppError, ErrorEnvelope, InvalidCursor, NotAdmin, Unauthorized},
    state::AppState,
};

/// `/admin/*` routes other than claims.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(stats))
        .routes(routes!(accounts))
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
    /// The account's place on the team; the super admin grants `admin`, admins only `seed_admin`.
    pub role: TeamRole,
}

/// Query of `GET /admin/accounts`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct AccountsQuery {
    /// Which accounts, in which order; defaults to `last_seen`.
    #[param(inline)]
    pub view: Option<AccountView>,
    /// Keeps the accounts whose email contains it.
    pub q: Option<String>,
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// Page size, defaulted and clamped by `page::limit`.
    pub limit: Option<i64>,
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

/// Accounts for the admin Accounts tab: last seen, new, unconfirmed, organisers or the team.
#[utoipa::path(
    get,
    path = "/admin/accounts",
    tag = "admin",
    operation_id = "list_accounts",
    params(AccountsQuery),
    security(("session" = [])),
    responses(
        (status = OK, body = Page<AccountRow>),
        Unauthorized,
        NotAdmin,
        InvalidCursor,
    )
)]
async fn accounts(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<AccountsQuery>,
) -> Result<Json<Page<AccountRow>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let email = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty());
    let view = query.view.unwrap_or_default();
    let window = page::window(limit, offset);
    let accounts = db::users::accounts(&state.pool, view, email, window).await?;
    let rows = accounts
        .into_iter()
        .map(|account| AccountRow::new(account, &current.user))
        .collect();
    Ok(Json(Page::from_offset(rows, limit, offset)))
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
        (status = CONFLICT, description = "Already merged, `{id}` is verified, or both are in different active entries of one battle", body = ErrorEnvelope),
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
    let (pool, into, admin) = (&state.pool, req.into, current.user.id);
    let merged = transaction::retrying(move || async move {
        let mut tx = transaction::begin(pool, MergeLock::Exclusive).await?;
        let loser = db::dancers::find_for_update(&mut tx, id)
            .await?
            .ok_or(AppError::NotFound)?;
        let survivor = db::dancers::find_for_update(&mut tx, into)
            .await?
            .ok_or_else(|| AppError::invalid("into", "unknown dancer"))?;
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
        if let Some(battle) = db::dancers::shared_battle(&mut tx, id, into).await? {
            return Err(AppError::Conflict(format!(
                "both dancers compete in {battle}; withdraw or remove one entry first"
            )));
        }
        let aliases = db::dancers::merge(&mut tx, &loser, &survivor, admin).await?;
        db::admin_actions::record(&mut tx, admin, Logged::DancerMerged(id)).await?;
        tx.commit().await?;
        Ok(MergeResponse {
            merged_into: survivor.id,
            aliases,
            instagram_handle: survivor.instagram_handle.or(loser.instagram_handle),
        })
    })
    .await?;
    Ok(Json(merged))
}

/// Put an account on the team, change its place there or take it off (not your own); the super
/// admin manages admins, admins manage seed admins (M31).
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
        (status = FORBIDDEN, description = "Not an admin, or not allowed to change this account or grant this role", body = ErrorEnvelope),
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
    let mut tx = state.pool.begin().await?;
    let account = db::users::find_for_update(&mut tx, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !current.user.role.may_set(account.role, req.role) {
        return Err(AppError::Forbidden);
    }
    if req.role == TeamRole::None {
        // The jams it entered stay the team's, so they can't stay with someone off the team.
        db::events::hand_over_team_jams(&mut tx, id, current.user.id).await?;
    }
    let user = db::users::set_role(&mut tx, id, req.role.role()).await?;
    let logged = Logged::RoleChanged(id, user.role);
    db::admin_actions::record(&mut tx, current.user.id, logged).await?;
    tx.commit().await?;
    Ok(Json(UserResponse::load(&state.pool, user).await?))
}
