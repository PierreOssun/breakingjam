//! Jam reviews: the admins' queue of jams waiting to go public, and their decisions.

use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Deserialize;
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;
use validator::Validate;

use super::{
    events::EventResponse,
    json::ValidJson,
    page::{self, Page},
};
use crate::{
    auth::session::CurrentUser,
    db,
    domain::{
        event::{Event, Review, can_write},
        not_blank,
        user::Role,
    },
    error::{AppError, ErrorEnvelope},
    state::AppState,
};

/// `/admin/events` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(queue))
        .routes(routes!(approve))
        .routes(routes!(reject))
}

/// Query of `GET /admin/events`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ReviewQuery {
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// Page size, defaulted and clamped by `page::limit`.
    pub limit: Option<i64>,
}

/// Body of `POST /admin/events/{id}/reject`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RejectRequest {
    /// What the organiser should change, shown on their jam editor.
    #[validate(length(max = 1000), custom(function = "not_blank"))]
    pub note: String,
}

/// Jams waiting for an admin's approval, the soonest first.
#[utoipa::path(
    get,
    path = "/admin/events",
    tag = "admin",
    operation_id = "list_jams_in_review",
    params(ReviewQuery),
    security(("session" = [])),
    responses(
        (status = OK, body = Page<EventResponse>),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Not an admin", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid cursor", body = ErrorEnvelope),
    )
)]
async fn queue(
    State(state): State<AppState>,
    current: CurrentUser,
    Query(query): Query<ReviewQuery>,
) -> Result<Json<Page<EventResponse>>, AppError> {
    current.require(Role::Admin)?;
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let jams = db::events::in_review(&state.pool, page::window(limit, offset)).await?;
    let ids: Vec<Uuid> = jams.iter().map(|jam| jam.organizer_id).collect();
    let organizers = db::organizers::references(&state.pool, &ids).await?;
    let rows = jams
        .into_iter()
        .map(|event| EventResponse {
            can_edit: can_write(&current.user, event.organizer_id),
            organizer: organizers.get(&event.organizer_id).cloned(),
            event,
        })
        .collect();
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// Approve a jam in review: it goes public.
#[utoipa::path(
    post,
    path = "/admin/events/{id}/approve",
    tag = "admin",
    operation_id = "approve_jam",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Not an admin", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such jam", body = ErrorEnvelope),
        (status = CONFLICT, description = "Not in review", body = ErrorEnvelope),
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
    operation_id = "reject_jam",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body = RejectRequest,
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Not an admin", body = ErrorEnvelope),
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
    let note = match &review {
        Review::Reject(note) => Some(note.as_str()),
        Review::Approve => None,
    };
    db::events::review(&state.pool, id, next, note)
        .await?
        .map(Json)
        .ok_or_else(not_in_review)
}
