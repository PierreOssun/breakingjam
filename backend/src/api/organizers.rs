//! `/organizers`: the organiser page, its edits, and Instagram verification (M12c).

use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Serialize;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    claims::QueueQuery,
    json::ValidJson,
    page::{self, Page},
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db,
    domain::{
        claim::ClaimStatus,
        dancer::EventRef,
        organizer::{Organizer, OrganizerClaim, OrganizerClaimForReview, OrganizerFields},
        user::Role,
    },
    error::{AppError, ErrorEnvelope, InvalidCursor, InvalidFields, NotAdmin, Unauthorized},
    state::AppState,
};

/// `/organizers*` and `/admin/organizer-claims*` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(show, update))
        .routes(routes!(events))
        .routes(routes!(mine, open))
        .routes(routes!(queue))
        .routes(routes!(approve))
        .routes(routes!(reject))
}

/// An organiser page, and whether the caller may edit it.
#[derive(Debug, Serialize, ToSchema)]
pub struct OrganizerResponse {
    /// The page itself.
    #[serde(flatten)]
    pub organizer: Organizer,
    /// Only the organiser edits their own page.
    pub can_edit: bool,
}

/// Body of `GET /organizers/{id}/events`: upcoming soonest first, past most recent first.
#[derive(Debug, Serialize, ToSchema)]
pub struct OrganizerEvents {
    /// Public jams starting today or later.
    pub upcoming: Vec<EventRef>,
    /// Earlier public jams, cancelled ones included.
    pub past: Vec<EventRef>,
}

/// An organiser's page: name, Instagram, place, bio and the tick.
#[utoipa::path(
    get,
    path = "/organizers/{id}",
    tag = "organizers",
    operation_id = "get_organizer",
    params(("id" = Uuid, Path, description = "Account id")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = OrganizerResponse),
        (status = NOT_FOUND, description = "No such account, or it never registered a jam", body = ErrorEnvelope),
    )
)]
async fn show(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id): Path<Uuid>,
) -> Result<Json<OrganizerResponse>, AppError> {
    let organizer = db::organizers::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let can_edit = current.is_some_and(|c| c.user.id == id);
    Ok(Json(OrganizerResponse {
        organizer,
        can_edit,
    }))
}

/// Replace your organiser page; a new Instagram handle needs verifying again.
#[utoipa::path(
    put,
    path = "/organizers/{id}",
    tag = "organizers",
    operation_id = "update_organizer",
    params(("id" = Uuid, Path, description = "Account id: your own")),
    request_body = OrganizerFields,
    security(("session" = [])),
    responses(
        (status = OK, body = OrganizerResponse),
        Unauthorized,
        (status = FORBIDDEN, description = "Someone else's page", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No organiser page", body = ErrorEnvelope),
        (status = CONFLICT, description = "Instagram handle already taken", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<OrganizerFields>,
) -> Result<Json<OrganizerResponse>, AppError> {
    own_page(&state, &current, id).await?;
    let mut tx = state.pool.begin().await?;
    let organizer = db::organizers::update(&mut tx, id, &fields).await?;
    tx.commit().await?;
    Ok(Json(OrganizerResponse {
        organizer,
        can_edit: true,
    }))
}

/// The organiser's public jams, split into upcoming and past.
#[utoipa::path(
    get,
    path = "/organizers/{id}/events",
    tag = "organizers",
    operation_id = "organizer_events",
    params(("id" = Uuid, Path, description = "Account id")),
    responses(
        (status = OK, body = OrganizerEvents),
        (status = NOT_FOUND, description = "No organiser page", body = ErrorEnvelope),
    )
)]
async fn events(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<OrganizerEvents>, AppError> {
    db::organizers::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let (upcoming, past): (Vec<_>, Vec<_>) = db::organizers::events(&state.pool, id)
        .await?
        .into_iter()
        .partition(|(_, upcoming)| *upcoming);
    Ok(Json(OrganizerEvents {
        upcoming: upcoming.into_iter().map(|(event, _)| event).collect(),
        // Rows come oldest first; the past list reads most recent first.
        past: past.into_iter().rev().map(|(event, _)| event).collect(),
    }))
}

/// Verify your Instagram: get a code for your bio; repeating returns the same pending claim.
#[utoipa::path(
    post,
    path = "/organizers/{id}/claim",
    tag = "organizers",
    operation_id = "open_organizer_claim",
    params(("id" = Uuid, Path, description = "Account id: your own")),
    security(("session" = [])),
    responses(
        (status = OK, body = OrganizerClaim),
        Unauthorized,
        (status = FORBIDDEN, description = "Someone else's page", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No organiser page", body = ErrorEnvelope),
        (status = CONFLICT, description = "Already verified", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "No Instagram handle to verify", body = ErrorEnvelope),
    )
)]
async fn open(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<OrganizerClaim>, AppError> {
    let organizer = own_page(&state, &current, id).await?;
    let Some(handle) = organizer.instagram_handle else {
        return Err(AppError::invalid(
            "instagram_handle",
            "add your Instagram handle first",
        ));
    };
    if organizer.verified_at.is_some() {
        return Err(AppError::Conflict("this handle is already verified".into()));
    }
    Ok(Json(
        db::organizers::open_claim(&state.pool, id, &handle).await?,
    ))
}

/// Your latest Instagram claim.
#[utoipa::path(
    get,
    path = "/organizers/{id}/claim",
    tag = "organizers",
    operation_id = "my_organizer_claim",
    params(("id" = Uuid, Path, description = "Account id: your own")),
    security(("session" = [])),
    responses(
        (status = OK, body = OrganizerClaim),
        Unauthorized,
        (status = FORBIDDEN, description = "Someone else's page", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No claim yet", body = ErrorEnvelope),
    )
)]
async fn mine(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<OrganizerClaim>, AppError> {
    own_page(&state, &current, id).await?;
    db::organizers::latest_claim(&state.pool, id)
        .await?
        .map(Json)
        .ok_or(AppError::NotFound)
}

/// Organiser claims to review, oldest first.
#[utoipa::path(
    get,
    path = "/admin/organizer-claims",
    tag = "organizers",
    operation_id = "list_organizer_claims",
    params(QueueQuery),
    security(("session" = [])),
    responses(
        (status = OK, body = Page<OrganizerClaimForReview>),
        Unauthorized,
        NotAdmin,
        InvalidCursor,
    )
)]
async fn queue(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<QueueQuery>,
) -> Result<Json<Page<OrganizerClaimForReview>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let status = query.status.unwrap_or(ClaimStatus::Pending);
    let window = page::window(limit, offset);
    let rows = db::organizers::list_claims(&state.pool, status, window).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// Approve: the organiser gets the tick, if the handle is still the one claimed.
#[utoipa::path(
    post,
    path = "/admin/organizer-claims/{id}/approve",
    tag = "organizers",
    operation_id = "approve_organizer_claim",
    params(("id" = Uuid, Path, description = "Claim id")),
    security(("session" = [])),
    responses(
        (status = OK, body = OrganizerClaim),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such claim", body = ErrorEnvelope),
        (status = CONFLICT, description = "Already reviewed, or the handle changed since", body = ErrorEnvelope),
    )
)]
async fn approve(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<OrganizerClaim>, AppError> {
    decide(&state, &current, id, ClaimStatus::Approved).await
}

/// Reject an organiser claim; they may ask again.
#[utoipa::path(
    post,
    path = "/admin/organizer-claims/{id}/reject",
    tag = "organizers",
    operation_id = "reject_organizer_claim",
    params(("id" = Uuid, Path, description = "Claim id")),
    security(("session" = [])),
    responses(
        (status = OK, body = OrganizerClaim),
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
) -> Result<Json<OrganizerClaim>, AppError> {
    decide(&state, &current, id, ClaimStatus::Rejected).await
}

async fn decide(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
    decision: ClaimStatus,
) -> Result<Json<OrganizerClaim>, AppError> {
    current.require(Role::Admin)?;
    let mut tx = state.pool.begin().await?;
    let claim = db::organizers::find_claim_for_update(&mut tx, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if claim.status != ClaimStatus::Pending {
        return Err(AppError::Conflict("this claim was already reviewed".into()));
    }
    if decision == ClaimStatus::Approved && !db::organizers::verify(&mut tx, &claim).await? {
        return Err(AppError::Conflict(
            "the Instagram handle changed since this request".into(),
        ));
    }
    let claim = db::organizers::decide_claim(&mut tx, id, decision, current.user.id).await?;
    tx.commit().await?;
    Ok(Json(claim))
}

/// The caller's own organiser page: 404 without one, 403 for anyone else's.
async fn own_page(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
) -> Result<Organizer, AppError> {
    let organizer = db::organizers::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if current.user.id != id {
        return Err(AppError::Forbidden);
    }
    Ok(organizer)
}
