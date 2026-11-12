//! `/events`: jam CRUD, status transitions and the map's GeoJSON.

use axum::{
    Json,
    extract::State,
    http::{
        StatusCode,
        header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    extract::{Path, Query, ValidJson},
    page::{self, Page},
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    calendar,
    db::{self, events::MapPoint},
    domain::{
        battle::{Battle, Category, starts_during},
        event::{Event, EventFields, EventStatus, Missing, Phase, Transition, can_write},
        organizer::OrganizerRef,
        user::{Role, User},
    },
    error::{
        AppError, Busy, ErrorEnvelope, InvalidCursor, InvalidFields, JamNotVisible, JamOver,
        Unauthorized,
    },
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
    /// Upcoming, live or past.
    pub phase: Phase,
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
    /// Whether a battle of this live or past jam has a video: previews show "Videos available"
    /// and link to its battles (M28).
    pub has_videos: bool,
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
            phase: p.phase,
            city: p.city,
            country: p.country,
            battles: battles.into_iter().map(|b| b.name).collect(),
            categories,
            flyer_card_url: p.flyer_card_url,
            has_videos: p.has_videos,
        },
    }
}

/// A jam page: the jam, and what the caller may do with it.
#[derive(Debug, Serialize, ToSchema)]
pub struct EventResponse {
    /// The jam itself.
    #[serde(flatten)]
    pub event: Event,
    /// Whether the caller may edit its details, flyer and lineup or delete it; no longer for its
    /// organiser once it is public and over.
    pub can_edit: bool,
    /// Whether the caller may edit its battles, entries and results; still true once it is over.
    pub can_edit_battles: bool,
    /// The status changes the caller may make now.
    pub actions: Vec<Transition>,
    /// Who runs it: the jam page's organiser card (M12c); null when the BreakingJam team
    /// entered it, as the team is not its organiser.
    pub organizer: Option<OrganizerRef>,
}

impl EventResponse {
    /// The jam as `user` sees it, with what they may do.
    pub fn new(event: Event, user: Option<&User>, organizer: Option<OrganizerRef>) -> Self {
        Self {
            can_edit: user.is_some_and(|u| event.editable_by(u)),
            can_edit_battles: user.is_some_and(|u| can_write(u, event.organizer_id)),
            actions: user.map(|u| event.actions(u)).unwrap_or_default(),
            event,
            organizer,
        }
    }
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
    let organizer = db::organizers::reference(&state.pool, event.id).await?;
    let user = current.as_ref().map(|c| &c.user);
    Ok(Json(EventResponse::new(event, user, organizer)))
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
    check_timezone(&state, &fields.timezone).await?;
    let mut tx = state.pool.begin().await?;
    // Registering a first jam makes a plain user an organiser (decided in M5).
    db::users::promote_to_organizer(&mut tx, current.user.id).await?;
    let event = db::events::insert(&mut *tx, Uuid::now_v7(), current.user.id, &fields).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(event)))
}

/// Replace a jam's fields; slug and status never change here, past draft the place stays, and
/// once public and over only the team may.
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
        JamOver,
        (status = UNPROCESSABLE_ENTITY, description = "Invalid fields, an unknown timezone, a jam past draft losing its city, country or pin (`place`), or a jam in review losing both its Instagram link and its contact email (`contact`)", body = ErrorEnvelope),
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<EventFields>,
) -> Result<Json<Event>, AppError> {
    writable(&state, &current, id).await?;
    check_timezone(&state, &fields.timezone).await?;
    let mut tx = state.pool.begin().await?;
    // Locked, so a battle saved meanwhile can't fall outside the days checked here.
    let event = db::events::find_locked(&mut tx, id)
        .await?
        .ok_or(AppError::NotFound)?;
    check_update(&mut tx, &current, &event, &fields).await?;
    let event = db::events::update(&mut *tx, id, &fields).await?;
    tx.commit().await?;
    Ok(Json(event))
}

/// What a save of `fields` over the locked `event` must respect: the lock, the battles' days,
/// the place past draft, and no public jam moved into the past by its organiser.
async fn check_update(
    conn: &mut PgConnection,
    current: &CurrentUser,
    event: &Event,
    fields: &EventFields,
) -> Result<(), AppError> {
    check_editable(current, event)?;
    check_days(&db::battles::list(&mut *conn, event.id).await?, fields)?;
    // Past draft, the map, the lists and the stats count on the place staying (M24). Only what
    // it has can be lost: a jam published without a pin before the checklist keeps saving.
    if event.status != EventStatus::Draft && event.loses_place(fields) {
        AppError::check(vec![Missing::Place.as_field()])?;
    }
    // In review, the approval runs the checklist again: the contact it was sent with stays. Once
    // public, the team has reached the organiser, so the jam may drop it (M30).
    if event.status == EventStatus::InReview && event.loses_contact(fields) {
        AppError::check(vec![Missing::Contact.as_field()])?;
    }
    // Moved into the past, a public jam would lock its organiser out of moving it back.
    if event.status.is_public() && current.user.role < Role::SeedAdmin {
        let phase = db::events::phase_of(conn, fields.starts_on, fields.ends_on, &fields.timezone);
        if phase.await? == Phase::Past {
            return Err(AppError::invalid(
                "ends_on",
                "a public jam can't be moved into the past",
            ));
        }
    }
    Ok(())
}

/// The jam's days keep every announced battle start; the boundary that would drop one is refused.
fn check_days(battles: &[Battle], fields: &EventFields) -> Result<(), AppError> {
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

/// 422 on a timezone Postgres doesn't know: `jam_phase` reads the jam's calendar in it.
async fn check_timezone(state: &AppState, timezone: &str) -> Result<(), AppError> {
    if db::events::known_timezone(&state.pool, timezone).await? {
        Ok(())
    } else {
        Err(AppError::invalid(
            "timezone",
            "unknown timezone, e.g. Europe/Zurich",
        ))
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
        JamOver,
    )
)]
async fn delete(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    editable(&state, &current, id).await?;
    let flyer = db::events::soft_delete(&state.pool, id).await?;
    // Nothing edits a deleted jam, so its flyer goes now or stays public for good.
    super::flyers::discard(&state.media, flyer);
    Ok(StatusCode::NO_CONTENT)
}

/// Move a jam along draft → in_review → published → registration_closed, or cancel it; the
/// BreakingJam team publishes drafts without review. `actions` on the jam says what is allowed.
#[utoipa::path(
    post,
    path = "/events/{id}/{transition}",
    tag = "events",
    operation_id = "transition_event",
    params(
        ("id" = Uuid, Path, description = "Jam id"),
        ("transition" = inline(Transition), Path, description = "`publish` is for `seed_admin`+; cancel is allowed from any status but cancelled"),
    ),
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        (status = FORBIDDEN, description = "Not the organiser nor `seed_admin`+, or `publish` by an organiser", body = ErrorEnvelope),
        JamNotVisible,
        (status = CONFLICT, description = "The current status does not allow it, or the jam is public and over", body = ErrorEnvelope),
        (status = UNPROCESSABLE_ENTITY, description = "`submit` or `publish` before the venue is on the map, a battle exists and an Instagram link or contact email is set; `fields` names `place`, `battles` and `contact`", body = ErrorEnvelope),
    )
)]
async fn transition(
    State(state): State<AppState>,
    current: CurrentUser,
    Path((id, transition)): Path<(Uuid, Transition)>,
) -> Result<Json<Event>, AppError> {
    writable(&state, &current, id).await?;
    current.require(transition.required_role())?;
    let mut tx = state.pool.begin().await?;
    // Locked, so no save can take the place or the last battle between the checklist and the change.
    let event = db::events::find_locked(&mut tx, id)
        .await?
        .ok_or(AppError::NotFound)?;
    check_editable(&current, &event)?;
    let next = event
        .status
        .apply(transition)
        .map_err(|err| AppError::Conflict(err.to_string()))?;
    if transition.announces() {
        // The publish checklist (M24): a venue on the map and at least one battle.
        let battles = db::battles::list(&mut *tx, id).await?.len();
        let missing = event.missing(battles).into_iter().map(Missing::as_field);
        AppError::check(missing.collect())?;
    }
    let event = db::events::set_status(&mut *tx, id, event.status, next, None)
        .await?
        .ok_or_else(|| AppError::Conflict("status changed meanwhile, reload and retry".into()))?;
    tx.commit().await?;
    Ok(Json(event))
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
        Busy,
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
    let png = flyer::render_og(svg).await?;
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

/// The jam if `current` may edit its details: `writable`, then 409 once it is public and over.
pub(super) async fn editable(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
) -> Result<Event, AppError> {
    let event = writable(state, current, id).await?;
    check_editable(current, &event)?;
    Ok(event)
}

/// 409 once the jam is public and over, unless `current` is on the BreakingJam team: only its
/// battles and their results change then.
fn check_editable(current: &CurrentUser, event: &Event) -> Result<(), AppError> {
    if event.editable_by(&current.user) {
        Ok(())
    } else {
        Err(AppError::Conflict(
            "this jam is over: only its battles and results can change".into(),
        ))
    }
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
