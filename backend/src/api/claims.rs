//! "Verify me": users claim a dancer page; admins review the queue (§4 "Dancer identity").

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use uuid::Uuid;

use super::page::{self, Page};
use crate::{
    auth::session::CurrentUser,
    db,
    domain::{
        claim::{Claim, ClaimForReview, ClaimStatus},
        user::Role,
    },
    error::AppError,
    state::AppState,
};

/// Claim routes, for users and for admins.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dancers/{id}/claim", get(mine).post(open))
        .route("/admin/claims", get(queue))
        .route("/admin/claims/{id}/approve", post(approve))
        .route("/admin/claims/{id}/reject", post(reject))
}

/// Query of `GET /admin/claims`.
#[derive(Debug, Deserialize)]
pub struct QueueQuery {
    /// Defaults to `pending`.
    pub status: Option<ClaimStatus>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

async fn open(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(dancer_id): Path<Uuid>,
) -> Result<Json<Claim>, AppError> {
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
    Ok(Json(
        db::claims::open(&state.pool, dancer_id, current.user.id).await?,
    ))
}

async fn mine(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(dancer_id): Path<Uuid>,
) -> Result<Json<Claim>, AppError> {
    db::claims::latest(&state.pool, dancer_id, current.user.id)
        .await?
        .map(Json)
        .ok_or(AppError::NotFound)
}

async fn queue(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<QueueQuery>,
) -> Result<Json<Page<ClaimForReview>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let status = query.status.unwrap_or(ClaimStatus::Pending);
    // One extra row tells whether another page exists.
    let rows = db::claims::list(&state.pool, status, (limit + 1, offset)).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

async fn approve(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Claim>, AppError> {
    decide(&state, &current, id, ClaimStatus::Approved).await
}

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
        // `dancers.user_id` is unique; checked here so the answer is readable, not a constraint name.
        if db::users::owns_dancer(&state.pool, claim.user_id).await? {
            return Err(AppError::Conflict(
                "this user already owns a dancer page".into(),
            ));
        }
        db::claims::grant_ownership(&mut tx, &claim, current.user.id).await?;
    }
    let claim = db::claims::decide(&mut tx, id, decision, current.user.id).await?;
    tx.commit().await?;
    Ok(Json(claim))
}
