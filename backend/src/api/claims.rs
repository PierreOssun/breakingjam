//! "Verify me": users claim a dancer page; admins review the queue (§4 "Dancer identity").

use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::page::{self, Page};
use crate::{
    auth::session::CurrentUser,
    db,
    domain::{
        claim::{Claim, ClaimForReview, ClaimStatus},
        user::Role,
    },
    error::{AppError, ErrorEnvelope, InvalidCursor, NotAdmin, Unauthorized},
    state::AppState,
};

/// Claim routes, for users and for admins.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(mine, open))
        .routes(routes!(queue))
        .routes(routes!(approve))
        .routes(routes!(reject))
}

/// Query of `GET /admin/claims`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct QueueQuery {
    /// Defaults to `pending`.
    pub status: Option<ClaimStatus>,
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// Page size, defaulted and clamped by `page::limit`.
    pub limit: Option<i64>,
}

/// Your claim on a dancer page, and whether someone else is claiming it too.
#[derive(Debug, Serialize, ToSchema)]
pub struct MyClaim {
    /// The claim itself.
    #[serde(flatten)]
    pub claim: Claim,
    /// Another account has a pending claim on the same page; both go to review.
    pub others_pending: bool,
}

/// "Verify me": get a code to put in your Instagram bio; repeating returns the same pending claim.
#[utoipa::path(
    post,
    path = "/dancers/{id}/claim",
    tag = "claims",
    operation_id = "open_claim",
    params(("id" = Uuid, Path, description = "Dancer id")),
    security(("session" = [])),
    responses(
        (status = OK, body = MyClaim),
        Unauthorized,
        (status = NOT_FOUND, description = "No such dancer, or merged away", body = ErrorEnvelope),
        (status = CONFLICT, description = "Dancer already verified, or you already own a page", body = ErrorEnvelope),
    )
)]
async fn open(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(dancer_id): Path<Uuid>,
) -> Result<Json<MyClaim>, AppError> {
    let dancer = db::dancers::find_live(&state.pool, dancer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if dancer.verified_at.is_some() {
        return Err(AppError::Conflict("this dancer is already verified".into()));
    }
    // `dancers.user_id` is unique: one account owns at most one page.
    if db::users::owns_dancer(&state.pool, current.user.id).await? {
        return Err(AppError::Conflict("you already own a dancer page".into()));
    }
    let claim = db::claims::open(&state.pool, dancer_id, current.user.id).await?;
    with_others(&state, claim).await
}

/// Your latest claim on this dancer.
#[utoipa::path(
    get,
    path = "/dancers/{id}/claim",
    tag = "claims",
    operation_id = "my_claim",
    params(("id" = Uuid, Path, description = "Dancer id")),
    security(("session" = [])),
    responses(
        (status = OK, body = MyClaim),
        Unauthorized,
        (status = NOT_FOUND, description = "No claim yet", body = ErrorEnvelope),
    )
)]
async fn mine(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(dancer_id): Path<Uuid>,
) -> Result<Json<MyClaim>, AppError> {
    let claim = db::claims::latest(&state.pool, dancer_id, current.user.id)
        .await?
        .ok_or(AppError::NotFound)?;
    with_others(&state, claim).await
}

async fn with_others(state: &AppState, claim: Claim) -> Result<Json<MyClaim>, AppError> {
    let others_pending =
        db::claims::others_pending(&state.pool, claim.dancer_id, claim.user_id).await?;
    Ok(Json(MyClaim {
        claim,
        others_pending,
    }))
}

/// Claims to review, oldest first.
#[utoipa::path(
    get,
    path = "/admin/claims",
    tag = "claims",
    operation_id = "list_claims",
    params(QueueQuery),
    security(("session" = [])),
    responses(
        (status = OK, body = Page<ClaimForReview>),
        Unauthorized,
        NotAdmin,
        InvalidCursor,
    )
)]
async fn queue(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<QueueQuery>,
) -> Result<Json<Page<ClaimForReview>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let status = query.status.unwrap_or(ClaimStatus::Pending);
    let rows = db::claims::list(&state.pool, status, page::window(limit, offset)).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// Approve: the dancer gets its owner and competing claims are rejected.
#[utoipa::path(
    post,
    path = "/admin/claims/{id}/approve",
    tag = "claims",
    operation_id = "approve_claim",
    params(("id" = Uuid, Path, description = "Claim id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Claim),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such claim, or its dancer is gone", body = ErrorEnvelope),
        (status = CONFLICT, description = "Already reviewed, or the dancer is already verified", body = ErrorEnvelope),
    )
)]
async fn approve(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Claim>, AppError> {
    decide(&state, &current, id, ClaimStatus::Approved).await
}

/// Reject a claim; the user may claim again.
#[utoipa::path(
    post,
    path = "/admin/claims/{id}/reject",
    tag = "claims",
    operation_id = "reject_claim",
    params(("id" = Uuid, Path, description = "Claim id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Claim),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such claim", body = ErrorEnvelope),
        (status = CONFLICT, description = "Already reviewed", body = ErrorEnvelope),
    )
)]
async fn reject(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Claim>, AppError> {
    decide(&state, &current, id, ClaimStatus::Rejected).await
}

async fn decide(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
    decision: ClaimStatus,
) -> Result<Json<Claim>, AppError> {
    current.require(Role::Admin)?;
    let mut tx = state.pool.begin().await?;
    let claim = db::claims::find_for_update(&mut tx, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if claim.status != ClaimStatus::Pending {
        return Err(AppError::Conflict("this claim was already reviewed".into()));
    }
    if decision == ClaimStatus::Approved {
        let dancer = db::dancers::find_for_update(&mut tx, claim.dancer_id)
            .await?
            .filter(|d| d.merged_into_id.is_none())
            .ok_or(AppError::NotFound)?;
        if dancer.verified_at.is_some() {
            return Err(AppError::Conflict("this dancer is already verified".into()));
        }
        // `dancers.user_id` is unique; the database decides so two approvals cannot both pass.
        db::claims::grant_ownership(&mut tx, &claim, current.user.id)
            .await
            .map_err(|err| match err {
                sqlx::Error::Database(db) if db.constraint() == Some("dancers_user_id_key") => {
                    AppError::Conflict("this user already owns a dancer page".into())
                }
                other => other.into(),
            })?;
    }
    let claim = db::claims::decide(&mut tx, id, decision, current.user.id).await?;
    tx.commit().await?;
    Ok(Json(claim))
}
