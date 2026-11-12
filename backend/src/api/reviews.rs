//! Jam reviews: the admins' queue of jams waiting to go public, their decisions and the history.

use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;
use validator::Validate;

use super::{
    events::EventResponse,
    extract::{Path, Query, ValidJson},
    page::{self, Page, PageQuery},
};
use crate::{
    auth::session::CurrentUser,
    db,
    domain::{
        admin_action::{JamDecision, Logged},
        event::{Event, Missing, Review},
        not_blank,
        user::Role,
    },
    error::{AppError, ErrorEnvelope, InvalidCursor, NotAdmin, Unauthorized},
    state::AppState,
};

/// `/admin/events` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(queue))
        .routes(routes!(history))
        .routes(routes!(approve))
        .routes(routes!(reject))
}

/// Body of `POST /admin/events/{id}/reject`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RejectRequest {
    /// What the organiser should change, shown on their jam editor.
    #[validate(length(max = 1000), custom(function = "not_blank"))]
    pub note: String,
}

/// A jam waiting for review, with how to reach the account that registered it.
#[derive(Debug, Serialize, ToSchema)]
pub struct ReviewItem {
    #[serde(flatten)]
    pub jam: EventResponse,
    /// The organiser's login email, confirmed since M27; for the team only, never on a public page.
    pub organizer_email: String,
}

/// Jams waiting for an admin's approval, the soonest first.
#[utoipa::path(
    get,
    path = "/admin/events",
    tag = "admin",
    operation_id = "list_events_in_review",
    params(PageQuery),
    security(("session" = [])),
    responses(
        (status = OK, body = Page<ReviewItem>),
        Unauthorized,
        NotAdmin,
        InvalidCursor,
    )
)]
async fn queue(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Page<ReviewItem>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let jams = db::events::in_review(&state.pool, page::window(limit, offset)).await?;
    let jam_ids: Vec<Uuid> = jams.iter().map(|jam| jam.id).collect();
    let owner_ids: Vec<Uuid> = jams.iter().map(|jam| jam.organizer_id).collect();
    let organizers = db::organizers::references(&state.pool, &jam_ids).await?;
    let emails = db::users::emails(&state.pool, &owner_ids).await?;
    let rows = jams
        .into_iter()
        .map(|event| {
            let organizer = organizers.get(&event.id).cloned();
            let organizer_email = emails.get(&event.organizer_id).cloned().unwrap_or_default();
            ReviewItem {
                jam: EventResponse::new(event, Some(&current.user), organizer),
                organizer_email,
            }
        })
        .collect();
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// Every approval and rejection, the newest first (M31).
#[utoipa::path(
    get,
    path = "/admin/events/history",
    tag = "admin",
    operation_id = "list_event_decisions",
    params(PageQuery),
    security(("session" = [])),
    responses(
        (status = OK, body = Page<JamDecision>),
        Unauthorized,
        NotAdmin,
        InvalidCursor,
    )
)]
async fn history(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<PageQuery>,
) -> Result<Json<Page<JamDecision>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let window = page::window(limit, offset);
    let rows = db::admin_actions::jam_history(&state.pool, window).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// Approve a jam in review: it goes public, if it still passes the publish checklist.
#[utoipa::path(
    post,
    path = "/admin/events/{id}/approve",
    tag = "admin",
    operation_id = "approve_event",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such jam", body = ErrorEnvelope),
        (status = CONFLICT, description = "Not in review", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "The venue left the map, the battles are gone or the contact is; `fields` names `place`, `battles` and `contact`", body = ErrorEnvelope),
    )
)]
async fn approve(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    decide(&state, &current, id, Review::Approve).await
}

/// Send a jam in review back to draft, with a note for its organiser.
#[utoipa::path(
    post,
    path = "/admin/events/{id}/reject",
    tag = "admin",
    operation_id = "reject_event",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body = RejectRequest,
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        NotAdmin,
        (status = NOT_FOUND, description = "No such jam", body = ErrorEnvelope),
        (status = CONFLICT, description = "Not in review", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Blank or too long note", body = ErrorEnvelope),
    )
)]
async fn reject(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(req): ValidJson<RejectRequest>,
) -> Result<Json<Event>, AppError> {
    decide(
        &state,
        &current,
        id,
        Review::Reject(req.note.trim().to_owned()),
    )
    .await
}

async fn decide(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
    review: Review,
) -> Result<Json<Event>, AppError> {
    current.require(Role::Admin)?;
    let event = db::events::find(&state.pool, &id.to_string())
        .await?
        .ok_or(AppError::NotFound)?;
    let not_in_review = || AppError::Conflict("this jam is not in review".into());
    let next = event.status.review(&review).ok_or_else(not_in_review)?;
    let (note, logged) = match &review {
        Review::Reject(note) => (Some(note.as_str()), Logged::JamRejected(id, note)),
        Review::Approve => {
            // Its organiser kept editing while it waited: it goes public only if still complete.
            let battles = db::battles::list(&state.pool, id).await?.len();
            let missing = event.missing(battles).into_iter().map(Missing::as_field);
            AppError::check(missing.collect())?;
            (None, Logged::JamApproved(id))
        }
    };
    let mut tx = state.pool.begin().await?;
    let decided = db::events::set_status(&mut *tx, id, event.status, next, note)
        .await?
        .ok_or_else(not_in_review)?;
    db::admin_actions::record(&mut tx, current.user.id, logged).await?;
    tx.commit().await?;
    Ok(Json(decided))
}
