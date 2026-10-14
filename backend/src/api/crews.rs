//! `/crews`: crew CRUD and dated memberships.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
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
    error::AppError,
    state::AppState,
};

/// `/crews*` routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/crews", get(list).post(create))
        .route("/crews/{id}", get(show).put(update).delete(remove))
        .route("/crews/{id}/members", post(add_member))
        .route("/crews/{id}/members/{dancer_id}", delete(end_member))
}

/// Query of `GET /crews`.
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// Substring of the crew name.
    pub q: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

/// A crew with its current members.
#[derive(Debug, Serialize)]
pub struct CrewDetail {
    #[serde(flatten)]
    pub crew: Crew,
    pub members: Vec<Member>,
}

/// Body of `POST /crews/{id}/members`.
#[derive(Debug, Deserialize, Validate)]
pub struct AddMemberRequest {
    pub dancer_id: Uuid,
    /// Join date; omit when unknown.
    pub since: Option<NaiveDate>,
}

async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Page<Crew>>, AppError> {
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    let q = query.q.as_deref().map(str::trim).filter(|q| !q.is_empty());
    // One extra row tells whether another page exists.
    let rows = db::crews::search(&state.pool, q, (limit + 1, offset)).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

async fn show(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<CrewDetail>, AppError> {
    let crew = db::crews::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    detail(&state, crew).await.map(Json)
}

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
    db::dancers::find(&state.pool, req.dancer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if db::crews::is_current_member(&state.pool, id, req.dancer_id).await? {
        return Err(AppError::Conflict("already a current member".into()));
    }
    db::crews::add_member(&state.pool, id, req.dancer_id, req.since).await?;
    Ok((StatusCode::CREATED, Json(detail(&state, crew).await?)))
}

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
