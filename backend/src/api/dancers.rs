//! `/dancers`: search-before-create, profiles and the jams a dancer took part in.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    json::ValidJson,
    page::{self, Page},
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db,
    domain::{
        crew::CrewRef,
        dancer::{self, Dancer, DancerFields, DancerSource, DancerSummary, Participation},
        user::Role,
    },
    error::{AppError, ErrorEnvelope},
    state::AppState,
};

/// `/dancers*` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(show, update, delete))
        .routes(routes!(events))
}

/// Query of `GET /dancers`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ListQuery {
    /// Substring of the name, an alias or the handle (`@` optional).
    pub q: Option<String>,
    /// Matches the first or second flag.
    pub country: Option<String>,
    /// Only verified (`true`) or only unverified (`false`) dancers.
    pub verified: Option<bool>,
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// Page size, defaulted and clamped by `page::limit`.
    pub limit: Option<i64>,
}

/// A dancer page (§6): profile, current crews, and whether the caller may edit it.
#[derive(Debug, Serialize, ToSchema)]
pub struct DancerResponse {
    /// The profile itself.
    #[serde(flatten)]
    pub dancer: Dancer,
    /// Current crews.
    pub crews: Vec<CrewRef>,
    /// Whether the caller may `PUT` this dancer.
    pub can_edit: bool,
}

/// Body of `GET /dancers/{id}`: the page, or where a merged dancer now lives (§4 "Merge").
#[derive(Debug, Serialize, ToSchema)]
#[serde(untagged)]
pub enum DancerPage {
    /// The frontend redirects to `/dancers/{merged_into}`.
    Merged {
        /// Where the dancer now lives.
        merged_into: Uuid,
    },
    /// The page itself.
    Dancer(Box<DancerResponse>),
}

/// Query of `GET /dancers/{id}/events`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct EventsQuery {
    /// Only one of the two lists; both when absent.
    #[param(inline)]
    pub scope: Option<Scope>,
}

/// Which list `GET /dancers/{id}/events` fills.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    Upcoming,
    Past,
}

/// Body of `GET /dancers/{id}/events`: upcoming by date, past most recent first.
#[derive(Debug, Serialize, ToSchema)]
pub struct DancerEvents {
    /// Jams starting today or later, soonest first.
    pub upcoming: Vec<Participation>,
    /// Earlier jams, most recent first.
    pub past: Vec<Participation>,
}

/// Search dancers by name, alias or handle; notable dancers first.
#[utoipa::path(
    get,
    path = "/dancers",
    tag = "dancers",
    operation_id = "search_dancers",
    params(ListQuery),
    responses(
        (status = OK, body = Page<DancerSummary>),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid cursor", body = ErrorEnvelope),
    )
)]
async fn list(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Page<DancerSummary>>, AppError> {
    let limit = page::limit(query.limit);
    let offset = page::offset(query.cursor.as_deref())?;
    // "@lil" finds handles; the '@' is never stored.
    let q = query
        .q
        .as_deref()
        .map(|q| q.trim().trim_start_matches('@'))
        .filter(|q| !q.is_empty());
    let filter = db::dancers::DancerFilter {
        query: q,
        country: query.country.as_deref(),
        verified: query.verified,
    };
    let rows = db::dancers::search(&state.pool, &filter, page::window(limit, offset)).await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

/// A dancer page, or `{ merged_into }` when the dancer was merged away.
#[utoipa::path(
    get,
    path = "/dancers/{id}",
    tag = "dancers",
    operation_id = "get_dancer",
    params(("id" = Uuid, Path, description = "Dancer id")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = DancerPage),
        (status = NOT_FOUND, description = "No such dancer", body = ErrorEnvelope),
    )
)]
async fn show(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id): Path<Uuid>,
) -> Result<Json<DancerPage>, AppError> {
    let dancer = db::dancers::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(merged_into) = dancer.merged_into_id {
        return Ok(Json(DancerPage::Merged { merged_into }));
    }
    let response = respond(&state, dancer, current.as_ref()).await?;
    Ok(Json(DancerPage::Dancer(Box::new(response))))
}

/// Create a dancer; `source` follows the creator's role.
#[utoipa::path(
    post,
    path = "/dancers",
    tag = "dancers",
    operation_id = "create_dancer",
    request_body = DancerFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = DancerResponse),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = CONFLICT, description = "Instagram handle already taken", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid fields", body = ErrorEnvelope),
    )
)]
async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    ValidJson(fields): ValidJson<DancerFields>,
) -> Result<(StatusCode, Json<DancerResponse>), AppError> {
    let source = DancerSource::for_creator(current.user.role);
    let dancer = db::dancers::insert(&state.pool, &fields, source, current.user.id).await?;
    let response = respond(&state, dancer, Some(&current)).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

/// Replace a dancer's profile; edits to unverified dancers are logged.
#[utoipa::path(
    put,
    path = "/dancers/{id}",
    tag = "dancers",
    operation_id = "update_dancer",
    params(("id" = Uuid, Path, description = "Dancer id")),
    request_body = DancerFields,
    security(("session" = [])),
    responses(
        (status = OK, body = DancerResponse),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Not the creator (unverified), the owner (verified) nor `seed_admin`+", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such dancer, or merged away", body = ErrorEnvelope),
        (status = CONFLICT, description = "Instagram handle already taken", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "Invalid fields", body = ErrorEnvelope),
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<DancerFields>,
) -> Result<Json<DancerResponse>, AppError> {
    let old = db::dancers::find_live(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !old.can_edit(&current.user) {
        return Err(AppError::Forbidden);
    }
    let mut tx = state.pool.begin().await?;
    let new = db::dancers::update(&mut tx, id, &fields).await?;
    // §4: every change to an unverified dancer is kept in `dancer_edits`.
    if old.verified_at.is_none() {
        let changes = dancer::changes(&old, &new);
        db::dancers::log_edits(&mut tx, id, current.user.id, &changes).await?;
    }
    tx.commit().await?;
    respond(&state, new, Some(&current)).await.map(Json)
}

/// Soft-delete a dancer.
#[utoipa::path(
    delete,
    path = "/dancers/{id}",
    tag = "dancers",
    operation_id = "delete_dancer",
    params(("id" = Uuid, Path, description = "Dancer id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Deleted"),
        (status = UNAUTHORIZED, description = "No valid session", body = ErrorEnvelope),
        (status = FORBIDDEN, description = "Below `seed_admin`", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such dancer", body = ErrorEnvelope),
    )
)]
async fn delete(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    current.require(Role::SeedAdmin)?;
    if !db::dancers::soft_delete(&state.pool, id).await? {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

/// The public jams a dancer competed in or worked at, split into upcoming and past.
#[utoipa::path(
    get,
    path = "/dancers/{id}/events",
    tag = "dancers",
    operation_id = "dancer_events",
    params(("id" = Uuid, Path, description = "Dancer id"), EventsQuery),
    responses(
        (status = OK, body = DancerEvents),
        (status = NOT_FOUND, description = "No such dancer", body = ErrorEnvelope),
    )
)]
async fn events(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(query): Query<EventsQuery>,
) -> Result<Json<DancerEvents>, AppError> {
    db::dancers::find_live(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let (upcoming, mut past): (Vec<_>, Vec<_>) = db::dancers::participations(&state.pool, id)
        .await?
        .into_iter()
        .partition(|p| p.upcoming);
    // Rows come oldest first; the past list reads most recent first.
    past.reverse();
    let wanted = |scope, rows: Vec<Participation>| {
        if query.scope.is_none_or(|s| s == scope) {
            rows
        } else {
            Vec::new()
        }
    };
    Ok(Json(DancerEvents {
        upcoming: wanted(Scope::Upcoming, upcoming),
        past: wanted(Scope::Past, past),
    }))
}

async fn respond(
    state: &AppState,
    dancer: Dancer,
    current: Option<&CurrentUser>,
) -> Result<DancerResponse, AppError> {
    let crews = db::dancers::current_crews(&state.pool, &[dancer.id])
        .await?
        .remove(&dancer.id)
        .unwrap_or_default();
    let can_edit = current.is_some_and(|c| dancer.can_edit(&c.user));
    Ok(DancerResponse {
        dancer,
        crews,
        can_edit,
    })
}
