//! `/crews`: crew CRUD and dated memberships.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;
use validator::Validate;

use super::{
    json::ValidJson,
    page::{self, Page},
};
use crate::{
    auth::session::CurrentUser,
    db,
    domain::{
        crew::{Crew, CrewFields, Member},
        user::Role,
    },
    error::{AppError, ErrorEnvelope},
    state::AppState,
};

/// `/crews*` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(show, update, remove))
        .routes(routes!(add_member))
        .routes(routes!(end_member))
}

/// Query of `GET /crews`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ListQuery {
    /// Substring of the crew name.
    pub q: Option<String>,
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// Page size, defaulted and clamped by `page::limit`.
    pub limit: Option<i64>,
}

/// A crew with its current members.
#[derive(Debug, Serialize, ToSchema)]
pub struct CrewDetail {
    /// The crew itself.
    #[serde(flatten)]
    pub crew: Crew,
    /// Current members, by name.
    pub members: Vec<Member>,
}

/// Body of `POST /crews/{id}/members`.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct AddMemberRequest {
    /// The dancer joining.
    pub dancer_id: Uuid,
    /// Join date; omit when unknown.
    pub since: Option<NaiveDate>,
}

/// Search crews by name.
#[utoipa::path(
    get,
    path = "/crews",
    tag = "crews",
    operation_id = "search_crews",
    params(ListQuery),
    responses(
        (status = OK, body = Page<Crew>),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid cursor", body = ErrorEnvelope),
    )
)]
async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Page<Crew>>, AppError> {
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let q = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty());
    let rows = db::crews::search(&state.pool, q, page::window(limit, offset)).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// A crew with its current members.
#[utoipa::path(
    get,
    path = "/crews/{id}",
    tag = "crews",
    operation_id = "get_crew",
    params(("id" = Uuid, Path, description = "Crew id")),
    responses(
        (status = OK, body = CrewDetail),
        (status = NOT_FOUND, description = "No such crew", body = ErrorEnvelope),
    )
)]
async fn show(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<CrewDetail>, AppError> {
    let crew = db::crews::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    detail(&state, crew).await.map(Json)
}

/// Create a crew.
#[utoipa::path(
    post,
    path = "/crews",
    tag = "crews",
    operation_id = "create_crew",
    request_body = CrewFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = CrewDetail),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Below `organizer`", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid fields", body = ErrorEnvelope),
    )
)]
async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    ValidJson(fields): ValidJson<CrewFields>,
) -> Result<(StatusCode, Json<CrewDetail>), AppError> {
    current.require(Role::Organizer)?;
    let crew = db::crews::insert(&state.pool, &fields).await?;
    Ok((
        StatusCode::CREATED,
        Json(CrewDetail {
            crew,
            members: Vec::new(),
        }),
    ))
}

/// Replace a crew's fields.
#[utoipa::path(
    put,
    path = "/crews/{id}",
    tag = "crews",
    operation_id = "update_crew",
    params(("id" = Uuid, Path, description = "Crew id")),
    request_body = CrewFields,
    security(("session" = [])),
    responses(
        (status = OK, body = CrewDetail),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Below `organizer`", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such crew", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid fields", body = ErrorEnvelope),
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<CrewFields>,
) -> Result<Json<CrewDetail>, AppError> {
    current.require(Role::Organizer)?;
    // A missing or soft-deleted crew surfaces as RowNotFound, hence 404.
    let crew = db::crews::update(&state.pool, id, &fields).await?;
    detail(&state, crew).await.map(Json)
}

/// Soft-delete a crew; memberships stay for history.
#[utoipa::path(
    delete,
    path = "/crews/{id}",
    tag = "crews",
    operation_id = "delete_crew",
    params(("id" = Uuid, Path, description = "Crew id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Deleted"),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Below `organizer`", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such crew", body = ErrorEnvelope),
    )
)]
async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    current.require(Role::Organizer)?;
    if !db::crews::soft_delete(&state.pool, id).await? {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Add a dancer to a crew.
#[utoipa::path(
    post,
    path = "/crews/{id}/members",
    tag = "crews",
    operation_id = "add_crew_member",
    params(("id" = Uuid, Path, description = "Crew id")),
    request_body = AddMemberRequest,
    security(("session" = [])),
    responses(
        (status = CREATED, body = CrewDetail),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Below `organizer`", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such crew or dancer", body = ErrorEnvelope),
        (status = CONFLICT, description = "Already a current member", body = ErrorEnvelope),
    )
)]
async fn add_member(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(req): ValidJson<AddMemberRequest>,
) -> Result<(StatusCode, Json<CrewDetail>), AppError> {
    current.require(Role::Organizer)?;
    let crew = db::crews::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    db::dancers::find_live(&state.pool, req.dancer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if db::crews::is_current_member(&state.pool, id, req.dancer_id).await? {
        return Err(AppError::Conflict("already a current member".into()));
    }
    db::crews::add_member(&state.pool, id, req.dancer_id, req.since).await?;
    Ok((StatusCode::CREATED, Json(detail(&state, crew).await?)))
}

/// End a current membership today.
#[utoipa::path(
    delete,
    path = "/crews/{id}/members/{dancer_id}",
    tag = "crews",
    operation_id = "end_crew_membership",
    params(("id" = Uuid, Path, description = "Crew id"), ("dancer_id" = Uuid, Path, description = "Dancer id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Membership ended"),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Below `organizer`", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No current membership", body = ErrorEnvelope),
    )
)]
async fn end_member(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, dancer_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    current.require(Role::Organizer)?;
    if !db::crews::end_membership(&state.pool, id, dancer_id).await? {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn detail(state: &AppState, crew: Crew) -> Result<CrewDetail, AppError> {
    let members = db::crews::current_members(&state.pool, crew.id).await?;
    Ok(CrewDetail { crew, members })
}
