//! `/dancers`: search-before-create, profiles and the jams a dancer took part in.

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
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
    db::{self, dancers::Participation},
    domain::{
        battle::{BattleAge, BattleFormat, BattleGender, BracketStage, EntryStatus, StaffRole},
        crew::CrewRef,
        dancer::{self, Dancer, DancerFields, DancerSource, DancerSummary},
        event::EventStatus,
        user::Role,
    },
    error::AppError,
    state::AppState,
};

/// `/dancers*` routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dancers", get(list).post(create))
        .route("/dancers/{id}", get(show).put(update).delete(delete))
        .route("/dancers/{id}/events", get(events))
}

/// Query of `GET /dancers`.
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// Substring of the name, an alias or the handle (`@` optional).
    pub q: Option<String>,
    /// Matches the first or second flag.
    pub country: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

/// A dancer page (§6): profile, current crews, and whether the caller may edit it.
#[derive(Debug, Serialize)]
pub struct DancerResponse {
    #[serde(flatten)]
    pub dancer: Dancer,
    pub crews: Vec<CrewRef>,
    /// Whether the caller may `PUT` this dancer.
    pub can_edit: bool,
}

/// Body of `GET /dancers/{id}`: the page, or where a merged dancer now lives (§4 "Merge").
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum DancerPage {
    /// The frontend redirects to `/dancers/{merged_into}`.
    Merged {
        merged_into: Uuid,
    },
    Dancer(Box<DancerResponse>),
}

/// Query of `GET /dancers/{id}/events`.
#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    /// Only one of the two lists; both when absent.
    pub scope: Option<Scope>,
}

/// Which list `GET /dancers/{id}/events` fills.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    Upcoming,
    Past,
}

/// Body of `GET /dancers/{id}/events`: upcoming by date, past most recent first.
#[derive(Debug, Serialize)]
pub struct DancerEvents {
    pub upcoming: Vec<ParticipationResponse>,
    pub past: Vec<ParticipationResponse>,
}

/// One appearance: the jam, the battle when competing, and the result when known.
#[derive(Debug, Serialize)]
pub struct ParticipationResponse {
    pub event: EventRef,
    /// Null for staff.
    pub battle: Option<BattleRef>,
    pub role: ParticipationRole,
    pub entry_status: Option<EntryStatus>,
    pub reached: Option<BracketStage>,
    pub final_rank: Option<i32>,
    pub video_url: Option<String>,
}

/// The jam side of a participation.
#[derive(Debug, Serialize)]
pub struct EventRef {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub starts_on: NaiveDate,
    pub ends_on: NaiveDate,
    pub city: String,
    pub country: String,
    pub status: EventStatus,
}

/// The battle side of a participation.
#[derive(Debug, Serialize)]
pub struct BattleRef {
    pub id: Uuid,
    pub name: String,
    pub format: BattleFormat,
    pub team_size: Option<i16>,
    pub gender: BattleGender,
    pub age: BattleAge,
}

/// Competitor, or the staff role held at the jam.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ParticipationRole {
    Competitor,
    Judge,
    Dj,
    Mc,
    Organizer,
    Other,
}

impl From<Option<StaffRole>> for ParticipationRole {
    fn from(role: Option<StaffRole>) -> Self {
        match role {
            None => Self::Competitor,
            Some(StaffRole::Judge) => Self::Judge,
            Some(StaffRole::Dj) => Self::Dj,
            Some(StaffRole::Mc) => Self::Mc,
            Some(StaffRole::Organizer) => Self::Organizer,
            Some(StaffRole::Other) => Self::Other,
        }
    }
}

impl From<Participation> for ParticipationResponse {
    fn from(p: Participation) -> Self {
        let battle = match (p.battle_id, p.battle_name, p.format, p.gender, p.age) {
            (Some(id), Some(name), Some(format), Some(gender), Some(age)) => Some(BattleRef {
                id,
                name,
                format,
                team_size: p.team_size,
                gender,
                age,
            }),
            _ => None,
        };
        Self {
            event: EventRef {
                id: p.event_id,
                name: p.event_name,
                slug: p.slug,
                starts_on: p.starts_on,
                ends_on: p.ends_on,
                city: p.city,
                country: p.country,
                status: p.status,
            },
            battle,
            role: p.staff_role.into(),
            entry_status: p.entry_status,
            reached: p.reached,
            final_rank: p.final_rank,
            video_url: p.video_url,
        }
    }
}

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
    // One extra row tells whether another page exists.
    let rows = db::dancers::search(
        &state.pool,
        q,
        query.country.as_deref(),
        (limit + 1, offset),
    )
    .await?;
    Ok(Json(Page::from_offset(rows, limit, offset)))
}

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

async fn events(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(query): Query<EventsQuery>,
) -> Result<Json<DancerEvents>, AppError> {
    db::dancers::find_live(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let wants = |scope| query.scope.is_none_or(|wanted| wanted == scope);
    let (upcoming, mut past): (Vec<_>, Vec<_>) = db::dancers::participations(&state.pool, id)
        .await?
        .into_iter()
        .partition(|p| p.upcoming);
    // Rows come oldest first; the past list reads most recent first.
    past.reverse();
    let convert = |rows: Vec<Participation>, scope| {
        if wants(scope) {
            rows.into_iter().map(Into::into).collect()
        } else {
            Vec::new()
        }
    };
    Ok(Json(DancerEvents {
        upcoming: convert(upcoming, Scope::Upcoming),
        past: convert(past, Scope::Past),
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
