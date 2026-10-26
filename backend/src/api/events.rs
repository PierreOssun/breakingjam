//! `/events`: jam CRUD, status transitions and the map's GeoJSON.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{
        StatusCode,
        header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use chrono::{NaiveDate, Utc};
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
    calendar,
    db::{self, events::MapPoint},
    domain::{
        battle::{Battle, Category, starts_during},
        event::{Event, EventFields, EventStatus, Transition, can_write},
        organizer::OrganizerRef,
    },
    error::{AppError, ErrorEnvelope, InvalidCursor, InvalidFields, JamNotVisible, Unauthorized},
    flyer::{self, FlyerOptions, FlyerText, Lang},
    state::AppState,
};

/// `/events*` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(geojson))
        .routes(routes!(show, update, delete))
        .routes(routes!(transition))
        .routes(routes!(flyer_svg))
        .routes(routes!(og_png))
        .routes(routes!(calendar_ics))
}

/// Query of `GET /events`.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
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

/// Query of the flyer and share-image routes.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct FlyerQuery {
    /// Date and art only, for thumbnails narrower than 120px.
    #[serde(default)]
    pub compact: bool,
    /// Language of the printed weekday, month and "cancelled" band.
    #[serde(default)]
    #[param(inline)]
    pub lang: Lang,
}

/// Query of the share-image route.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct OgQuery {
    /// Language of the printed weekday and month.
    #[serde(default)]
    #[param(inline)]
    pub lang: Lang,
}

/// A PNG body: `image/png` on the wire, binary in the OpenAPI document.
#[derive(Debug, ToSchema)]
#[schema(value_type = String, format = Binary)]
pub struct Png(pub Vec<u8>);

impl IntoResponse for Png {
    fn into_response(self) -> Response {
        ([(CONTENT_TYPE, "image/png")], self.0).into_response()
    }
}

/// `GET /events.geojson` body: a GeoJSON FeatureCollection of points.
#[derive(Debug, Serialize, ToSchema)]
pub struct FeatureCollection {
    /// Always `FeatureCollection`.
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// One feature per jam with coordinates.
    pub features: Vec<Feature>,
}

/// One jam on the map.
#[derive(Debug, Serialize, ToSchema)]
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
#[derive(Debug, Serialize, ToSchema)]
pub struct Point {
    /// Always `Point`.
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// `[lng, lat]`, per the GeoJSON spec.
    #[schema(value_type = Vec<f64>, min_items = 2, max_items = 2)]
    pub coordinates: [f64; 2],
}

/// What the map popup needs (§6 Map).
#[derive(Debug, Serialize, ToSchema)]
pub struct MapJam {
    /// Jam id.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Link target `/jams/{slug}`.
    pub slug: String,
    /// First day.
    pub starts_on: NaiveDate,
    /// Last day.
    pub ends_on: NaiveDate,
    /// `published` or `registration_closed`.
    pub status: EventStatus,
    /// City.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Battle names in display order: the popup's category line.
    pub battles: Vec<String>,
    /// What the map's category chips match, from all battles, without repeats.
    pub categories: Vec<Category>,
    /// The uploaded flyer at 540×675; null means the generated one.
    pub flyer_card_url: Option<String>,
}

/// List public jams, or your own with `mine=true`.
#[utoipa::path(
    get,
    path = "/events",
    tag = "events",
    operation_id = "list_events",
    params(ListQuery),
    security((), ("session" = [])),
    responses(
        (status = OK, body = Page<Event>),
        (status = UNAUTHORIZED, description = "`mine=true` without a session", body = ErrorEnvelope),
        InvalidCursor,
    )
)]
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
    let limit = page::limit(query.limit);
    let filter = db::events::ListFilter {
        status: query.status,
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

/// Public jams with coordinates, upcoming and past, for the world map.
#[utoipa::path(
    get,
    path = "/events.geojson",
    tag = "events",
    operation_id = "events_geojson",
    responses((status = OK, body = FeatureCollection))
)]
async fn geojson(State(state): State<AppState>) -> Result<Json<FeatureCollection>, AppError> {
    let points = db::events::map_points(&state.pool).await?;
    let ids: Vec<Uuid> = points.iter().map(|p| p.id).collect();
    let mut battles = db::battles::of_events(&state.pool, &ids).await?;
    let features = points
        .into_iter()
        .map(|p| {
            let battles = battles.remove(&p.id).unwrap_or_default();
            feature(p, battles)
        })
        .collect();
    Ok(Json(FeatureCollection {
        kind: "FeatureCollection",
        features,
    }))
}

/// A map point with its battles as one GeoJSON feature.
fn feature(p: MapPoint, battles: Vec<Battle>) -> Feature {
    let mut categories: Vec<Category> = battles.iter().flat_map(Battle::categories).collect();
    categories.sort();
    categories.dedup();
    Feature {
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
            ends_on: p.ends_on,
            status: p.status,
            city: p.city,
            country: p.country,
            battles: battles.into_iter().map(|b| b.name).collect(),
            categories,
            flyer_card_url: p.flyer_card_url,
        },
    }
}

/// A jam page: the jam, and whether the caller may edit it.
#[derive(Debug, Serialize, ToSchema)]
pub struct EventResponse {
    /// The jam itself.
    #[serde(flatten)]
    pub event: Event,
    /// Whether the caller may edit it, change its status or delete it.
    pub can_edit: bool,
    /// Who runs it: the jam page's organiser card (M12c); null when the BreakingJam team
    /// entered it, as the team is not its organiser.
    pub organizer: Option<OrganizerRef>,
}

/// One jam, by id or slug.
#[utoipa::path(
    get,
    path = "/events/{id}",
    tag = "events",
    operation_id = "get_event",
    params(("id" = String, Path, description = "Jam id or slug")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = EventResponse),
        JamNotVisible,
    )
)]
async fn show(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id_or_slug): Path<String>,
) -> Result<Json<EventResponse>, AppError> {
    let event = readable(&state, &current, &id_or_slug).await?;
    let can_edit = current
        .as_ref()
        .is_some_and(|c| can_write(&c.user, event.organizer_id));
    let organizer = db::organizers::reference(&state.pool, event.organizer_id).await?;
    Ok(Json(EventResponse {
        event,
        can_edit,
        organizer,
    }))
}

/// Register a jam as a draft; a first jam makes a `user` an `organizer`.
#[utoipa::path(
    post,
    path = "/events",
    tag = "events",
    operation_id = "create_event",
    request_body = EventFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = Event),
        Unauthorized,
        InvalidFields,
    )
)]
async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    ValidJson(fields): ValidJson<EventFields>,
) -> Result<(StatusCode, Json<Event>), AppError> {
    let mut tx = state.pool.begin().await?;
    // Registering a first jam makes a plain user an organiser (decided in M5).
    db::users::promote_to_organizer(&mut tx, current.user.id).await?;
    let event = db::events::insert(&mut *tx, Uuid::now_v7(), current.user.id, &fields).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(event)))
}

/// Replace a jam's fields; slug and status never change here.
#[utoipa::path(
    put,
    path = "/events/{id}",
    tag = "events",
    operation_id = "update_event",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body = EventFields,
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        (status = FORBIDDEN, description = "Not the organiser nor `seed_admin`+", body = ErrorEnvelope),
        JamNotVisible,
        InvalidFields,
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<EventFields>,
) -> Result<Json<Event>, AppError> {
    writable(&state, &current, id).await?;
    check_days(&state, id, &fields).await?;
    Ok(Json(db::events::update(&state.pool, id, &fields).await?))
}

/// The jam's days keep every announced battle start; the boundary that would drop one is refused.
async fn check_days(state: &AppState, id: Uuid, fields: &EventFields) -> Result<(), AppError> {
    let battles = db::battles::list(&state.pool, id).await?;
    let outside = battles
        .iter()
        .find(|b| !starts_during(b.starts_at, fields.starts_on, fields.ends_on))
        .and_then(|b| b.starts_at);
    match outside {
        None => Ok(()),
        Some(at) if at.date() < fields.starts_on => Err(AppError::invalid(
            "starts_on",
            "a battle starts before this day; move the battle first",
        )),
        Some(_) => Err(AppError::invalid(
            "ends_on",
            "a battle starts after this day; move the battle first",
        )),
    }
}

/// Soft-delete a jam.
#[utoipa::path(
    delete,
    path = "/events/{id}",
    tag = "events",
    operation_id = "delete_event",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Deleted"),
        Unauthorized,
        (status = FORBIDDEN, description = "Not the organiser nor `seed_admin`+", body = ErrorEnvelope),
        JamNotVisible,
    )
)]
async fn delete(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    writable(&state, &current, id).await?;
    let flyer = db::events::soft_delete(&state.pool, id).await?;
    // Nothing edits a deleted jam, so its flyer goes now or stays public for good.
    super::flyers::discard(&state.media, flyer);
    Ok(StatusCode::NO_CONTENT)
}

/// Move a jam along draft → in_review → published → registration_closed → completed, or
/// cancel it; the BreakingJam team publishes drafts without review.
#[utoipa::path(
    post,
    path = "/events/{id}/{transition}",
    tag = "events",
    operation_id = "transition_event",
    params(
        ("id" = Uuid, Path, description = "Jam id"),
        ("transition" = inline(Transition), Path, description = "`publish` is for `seed_admin`+; cancel is allowed from any status but completed"),
    ),
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        (status = FORBIDDEN, description = "Not the organiser nor `seed_admin`+, or `publish` by an organiser", body = ErrorEnvelope),
        JamNotVisible,
        (status = CONFLICT, description = "The current status does not allow it", body = ErrorEnvelope),
    )
)]
async fn transition(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, transition)): Path<(Uuid, Transition)>,
) -> Result<Json<Event>, AppError> {
    let event = writable(&state, &current, id).await?;
    current.require(transition.required_role())?;
    let next = event
        .status
        .apply(transition)
        .map_err(|err| AppError::Conflict(err.to_string()))?;
    db::events::set_status(&state.pool, id, event.status, next)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::Conflict("status changed meanwhile, reload and retry".into()))
}

/// The generated 4:5 flyer of a jam (DESIGN.md §4.24), as SVG to inline in the page.
#[utoipa::path(
    get,
    path = "/events/{id}/flyer.svg",
    tag = "events",
    operation_id = "event_flyer",
    params(("id" = String, Path, description = "Jam id or slug"), FlyerQuery),
    security((), ("session" = [])),
    responses(
        (status = OK, description = "SVG document: `role=\"img\"` with a localised label, or `aria-hidden` when compact", content_type = "image/svg+xml", body = String),
        JamNotVisible,
    )
)]
async fn flyer_svg(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id_or_slug): Path<String>,
    Query(query): Query<FlyerQuery>,
) -> Result<Response, AppError> {
    let (event, text) = flyer_text(&state, &current, &id_or_slug, query.lang).await?;
    // Gradient ids live in the page's id space: unique per jam and variant.
    let id = event.id.simple().to_string();
    let uid = format!("f{}{}", &id[20..], if query.compact { "c" } else { "" });
    let options = FlyerOptions {
        compact: query.compact,
        label: query.lang.flyer_label(),
        cancelled: (event.status == EventStatus::Cancelled).then(|| query.lang.cancelled()),
        uid: &uid,
    };
    let svg = flyer::flyer_svg(&text, flyer::seed(&event.id.to_string()), options);
    let headers = [
        (CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
        (CACHE_CONTROL, cache_control(&event)),
    ];
    Ok((headers, svg).into_response())
}

/// The 1200×630 Open Graph image of a jam: the flyer template rasterised to PNG.
#[utoipa::path(
    get,
    path = "/events/{id}/og.png",
    tag = "events",
    operation_id = "event_og_image",
    params(("id" = String, Path, description = "Jam id or slug"), OgQuery),
    security((), ("session" = [])),
    responses(
        (status = OK, description = "PNG, 1200×630", content_type = "image/png", body = Png),
        JamNotVisible,
    )
)]
async fn og_png(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id_or_slug): Path<String>,
    Query(query): Query<OgQuery>,
) -> Result<Response, AppError> {
    let (event, text) = flyer_text(&state, &current, &id_or_slug, query.lang).await?;
    let svg = flyer::og_svg(&text, flyer::seed(&event.id.to_string()), "og");
    // Rasterising takes tens of milliseconds of CPU; keep it off the request threads.
    let png = tokio::task::spawn_blocking(move || flyer::og_png(&svg))
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .map_err(|err| AppError::Internal(err.into()))?;
    Ok(([(CACHE_CONTROL, cache_control(&event))], Png(png)).into_response())
}

/// The jam as an iCalendar file, for "Add to calendar": one all-day event over its days.
#[utoipa::path(
    get,
    path = "/events/{id}/calendar.ics",
    tag = "events",
    operation_id = "event_calendar",
    params(("id" = String, Path, description = "Jam id or slug")),
    security((), ("session" = [])),
    responses(
        (status = OK, description = "An iCalendar file with one all-day event", content_type = "text/calendar", body = String),
        JamNotVisible,
    )
)]
async fn calendar_ics(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id_or_slug): Path<String>,
) -> Result<Response, AppError> {
    let event = readable(&state, &current, &id_or_slug).await?;
    let base = state.config.app_base_url.trim_end_matches('/');
    let page = format!("{base}/jams/{}", event.slug);
    let headers = [
        (CONTENT_TYPE, "text/calendar; charset=utf-8"),
        // A fixed ASCII name: slugs may hold any letter, which a header can't.
        (
            CONTENT_DISPOSITION,
            "attachment; filename=\"breakingjam.ics\"",
        ),
        (CACHE_CONTROL, cache_control(&event)),
    ];
    Ok((headers, calendar::ics(&event, &page, Utc::now())).into_response())
}

/// A visible jam and the text of its flyer.
async fn flyer_text(
    state: &AppState,
    current: &MaybeUser,
    id_or_slug: &str,
    lang: Lang,
) -> Result<(Event, FlyerText), AppError> {
    let event = readable(state, current, id_or_slug).await?;
    let names = db::battles::list(&state.pool, event.id)
        .await?
        .into_iter()
        .map(|battle| battle.name)
        .collect();
    let text = FlyerText::for_event(&event, names, lang);
    Ok((event, text))
}

/// Drafts and jams in review are private to their writers; public jams may be cached briefly.
fn cache_control(event: &Event) -> &'static str {
    if !event.status.is_public() {
        "private, no-store"
    } else {
        "public, max-age=300"
    }
}

/// The jam if the caller may see it: 404 when it is missing or a draft they can't write.
pub(super) async fn readable(
    state: &AppState,
    current: &MaybeUser,
    id_or_slug: &str,
) -> Result<Event, AppError> {
    db::events::find(&state.pool, id_or_slug)
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
