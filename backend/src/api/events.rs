//! `/events`: jam CRUD, status transitions and the map's GeoJSON.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    json::ValidJson,
    page::{self, Page},
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db,
    domain::event::{
        ALL_STATUSES, Event, EventFields, EventStatus, MAP_STATUSES, PUBLIC_STATUSES, Transition,
        can_write,
    },
    error::AppError,
    state::AppState,
};

/// `/events*` routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/events", get(list).post(create))
        .route("/events.geojson", get(geojson))
        .route("/events/{id}", get(show).put(update).delete(delete))
        .route("/events/{id}/publish", post(publish))
        .route("/events/{id}/close-registration", post(close_registration))
        .route("/events/{id}/complete", post(complete))
        .route("/events/{id}/cancel", post(cancel))
}

/// Query of `GET /events`.
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// Only jams in this status.
    pub status: Option<EventStatus>,
    /// Only jams in this country (ISO 3166-1 alpha-2).
    pub country: Option<String>,
    /// Only jams still running on or after this date.
    pub from: Option<NaiveDate>,
    /// Only jams starting on or before this date.
    pub to: Option<NaiveDate>,
    /// `true` lists the caller's own jams, drafts included (organiser list page).
    #[serde(default)]
    pub mine: bool,
    /// `next_cursor` of the previous page.
    pub cursor: Option<String>,
    /// Page size, defaulted and clamped by `page::limit`.
    pub limit: Option<i64>,
}

impl ListQuery {
    /// The statuses this query may return: `mine` sees drafts, everyone else public ones only.
    fn statuses(&self) -> Vec<EventStatus> {
        let visible: &[EventStatus] = if self.mine {
            &ALL_STATUSES
        } else {
            &PUBLIC_STATUSES
        };
        visible
            .iter()
            .copied()
            .filter(|status| self.status.is_none_or(|wanted| wanted == *status))
            .collect()
    }
}

/// `GET /events.geojson` body: a GeoJSON FeatureCollection of points.
#[derive(Debug, Serialize)]
pub struct FeatureCollection {
    /// Always `FeatureCollection`.
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// One feature per jam with coordinates.
    pub features: Vec<Feature>,
}

/// One jam on the map.
#[derive(Debug, Serialize)]
pub struct Feature {
    /// Always `Feature`.
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// Where the pin goes.
    pub geometry: Point,
    /// What the popup shows.
    pub properties: MapJam,
}

/// GeoJSON point; coordinates are `[lng, lat]`.
#[derive(Debug, Serialize)]
pub struct Point {
    /// Always `Point`.
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// `[lng, lat]`, per the GeoJSON spec.
    pub coordinates: [f64; 2],
}

/// What the map popup needs (§6 Map).
#[derive(Debug, Serialize)]
pub struct MapJam {
    /// Jam id.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Link target `/jams/{slug}`.
    pub slug: String,
    /// First day.
    pub starts_on: NaiveDate,
    /// City.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
}

async fn list(
    State(state): State<AppState>,
    current: MaybeUser,
    Query(query): Query<ListQuery>,
) -> Result<Json<Page<Event>>, AppError> {
    let organizer_id = match (query.mine, &current) {
        (false, _) => None,
        (true, Some(current)) => Some(current.user.id),
        (true, None) => return Err(AppError::Unauthorized),
    };
    let statuses = query.statuses();
    let limit = page::limit(query.limit);
    let filter = db::events::ListFilter {
        statuses: &statuses,
        country: query.country.as_deref(),
        from: query.from,
        to: query.to,
        organizer_id,
        after: query.cursor.as_deref().map(decode_cursor).transpose()?,
        // One extra row tells whether another page exists.
        limit: limit + 1,
    };
    let rows = db::events::list(&state.pool, &filter).await?;
    Ok(Json(Page::from_rows(rows, limit, encode_cursor)))
}

async fn geojson(State(state): State<AppState>) -> Result<Json<FeatureCollection>, AppError> {
    let points = db::events::map_points(&state.pool, &MAP_STATUSES).await?;
    let features = points
        .into_iter()
        .map(|p| Feature {
            kind: "Feature",
            geometry: Point {
                kind: "Point",
                coordinates: [p.lng, p.lat],
            },
            properties: MapJam {
                id: p.id,
                name: p.name,
                slug: p.slug,
                starts_on: p.starts_on,
                city: p.city,
                country: p.country,
            },
        })
        .collect();
    Ok(Json(FeatureCollection {
        kind: "FeatureCollection",
        features,
    }))
}

async fn show(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id_or_slug): Path<String>,
) -> Result<Json<Event>, AppError> {
    let event = db::events::find(&state.pool, &id_or_slug)
        .await?
        .filter(|event| event.visible_to(current.as_ref().map(|c| &c.user)))
        .ok_or(AppError::NotFound)?;
    Ok(Json(event))
}

async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    ValidJson(fields): ValidJson<EventFields>,
) -> Result<(StatusCode, Json<Event>), AppError> {
    AppError::check(fields.cross_field_errors())?;
    let mut tx = state.pool.begin().await?;
    // Registering a first jam makes a plain user an organiser (decided in M5).
    db::users::promote_to_organizer(&mut tx, current.user.id).await?;
    let event = db::events::insert(&mut tx, Uuid::now_v7(), current.user.id, &fields).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(event)))
}

async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<EventFields>,
) -> Result<Json<Event>, AppError> {
    AppError::check(fields.cross_field_errors())?;
    writable(&state, &current, id).await?;
    Ok(Json(db::events::update(&state.pool, id, &fields).await?))
}

async fn delete(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    writable(&state, &current, id).await?;
    db::events::soft_delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn publish(
    state: State<AppState>,
    current: CurrentUser,
    id: Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    transition(state, current, id, Transition::Publish).await
}

async fn close_registration(
    state: State<AppState>,
    current: CurrentUser,
    id: Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    transition(state, current, id, Transition::CloseRegistration).await
}

async fn complete(
    state: State<AppState>,
    current: CurrentUser,
    id: Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    transition(state, current, id, Transition::Complete).await
}

async fn cancel(
    state: State<AppState>,
    current: CurrentUser,
    id: Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    transition(state, current, id, Transition::Cancel).await
}

async fn transition(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    transition: Transition,
) -> Result<Json<Event>, AppError> {
    let event = writable(&state, &current, id).await?;
    let next = event
        .status
        .apply(transition)
        .map_err(|err| AppError::Conflict(err.to_string()))?;
    db::events::set_status(&state.pool, id, event.status, next)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::Conflict("status changed meanwhile, reload and retry".into()))
}

/// The jam if the caller may see it: 404 when it is missing or a draft they can't write.
pub(super) async fn readable(
    state: &AppState,
    current: &MaybeUser,
    id: Uuid,
) -> Result<Event, AppError> {
    db::events::find(&state.pool, &id.to_string())
        .await?
        .filter(|event| event.visible_to(current.as_ref().map(|c| &c.user)))
        .ok_or(AppError::NotFound)
}

/// The jam if `current` may write it: 404 when it is missing or invisible, 403 when read-only.
pub(super) async fn writable(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
) -> Result<Event, AppError> {
    let event = db::events::find(&state.pool, &id.to_string())
        .await?
        .filter(|event| event.visible_to(Some(&current.user)))
        .ok_or(AppError::NotFound)?;
    if !can_write(&current.user, event.organizer_id) {
        return Err(AppError::Forbidden);
    }
    Ok(event)
}

fn encode_cursor(event: &Event) -> String {
    format!("{}_{}", event.starts_on, event.id)
}

fn decode_cursor(cursor: &str) -> Result<(NaiveDate, Uuid), AppError> {
    let (date, id) = cursor.split_once('_').ok_or_else(page::invalid_cursor)?;
    Ok((
        date.parse().map_err(|_| page::invalid_cursor())?,
        id.parse().map_err(|_| page::invalid_cursor())?,
    ))
}
