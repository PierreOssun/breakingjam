//! `/dancers`: search-before-create, profiles and the jams a dancer took part in.

use axum::{Json, extract::State, http::StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgConnection;
use utoipa::{IntoParams, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    extract::{Path, Query, ValidJson},
    page::{self, Page},
    transaction,
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db::{self, dancers::MergeLock},
    domain::{
        crew::CrewRef,
        dancer::{
            self, AvatarFields, Dancer, DancerFields, DancerSource, DancerSummary, Participation,
        },
        event::by_phase,
        user::{Role, User},
    },
    error::{AppError, ErrorEnvelope, InvalidCursor, InvalidFields, Unauthorized},
    state::AppState,
};

/// `/dancers*` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(create_mine))
        .routes(routes!(show, update, delete))
        .routes(routes!(update_avatar))
        .routes(routes!(show_by_key))
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
    /// Whether the caller may send its `titles`: its verified owner, or `seed_admin`+.
    pub can_set_titles: bool,
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

/// Body of `GET /dancers/{id}/events`: live and upcoming soonest first, past most recent first.
#[derive(Debug, Serialize, ToSchema)]
pub struct DancerEvents {
    /// Jams running today, soonest first.
    pub live: Vec<Participation>,
    /// Jams starting after today, soonest first.
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
        InvalidCursor,
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
    page(&state, id, current.as_ref()).await
}

/// The page of a dancer from the curated data, by its key in `data/dancers.toml`: the same in
/// every environment, unlike its id (the Team page links its people this way).
#[utoipa::path(
    get,
    path = "/dancers/by-key/{key}",
    tag = "dancers",
    operation_id = "get_dancer_by_key",
    params(("key" = String, Path, description = "Key in `data/dancers.toml`, e.g. `iki`")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = DancerPage),
        (status = NOT_FOUND, description = "No dancer imported with this key", body = ErrorEnvelope),
    )
)]
async fn show_by_key(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(key): Path<String>,
) -> Result<Json<DancerPage>, AppError> {
    let id = db::dancers::id_by_key(&state.pool, &key)
        .await?
        .ok_or(AppError::NotFound)?;
    page(&state, id, current.as_ref()).await
}

/// A dancer page, or where it was merged into.
async fn page(
    state: &AppState,
    id: Uuid,
    current: Option<&CurrentUser>,
) -> Result<Json<DancerPage>, AppError> {
    let dancer = db::dancers::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(merged_into) = dancer.merged_into_id {
        return Ok(Json(DancerPage::Merged { merged_into }));
    }
    let response = respond(state, dancer, current).await?;
    Ok(Json(DancerPage::Dancer(Box::new(response))))
}

/// Create a page for someone else, as jam flows do; `source` follows the creator's role.
#[utoipa::path(
    post,
    path = "/dancers",
    tag = "dancers",
    operation_id = "create_dancer",
    request_body = DancerFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = DancerResponse),
        Unauthorized,
        (status = FORBIDDEN, description = "Below `organizer`, or titles or `instagram_hidden` below `seed_admin`", body = ErrorEnvelope),
        (status = CONFLICT, description = "Instagram handle already taken", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    ValidJson(fields): ValidJson<DancerFields>,
) -> Result<(StatusCode, Json<DancerResponse>), AppError> {
    // An account makes its own page through `create_mine`; other pages come with jams.
    current.require(Role::Organizer)?;
    check_new_titles(&fields, &current)?;
    let source = DancerSource::for_creator(current.user.role);
    let dancer = db::dancers::insert(&state.pool, &fields, source, current.user.id).await?;
    let response = respond(&state, dancer, Some(&current)).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

/// Create the account's own page (M25), unverified until a claim on it is approved; one per account.
#[utoipa::path(
    post,
    path = "/dancers/mine",
    tag = "dancers",
    operation_id = "create_own_dancer",
    request_body = DancerFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = DancerResponse),
        Unauthorized,
        (status = FORBIDDEN, description = "Titles or `instagram_hidden` below `seed_admin`: they come with verification", body = ErrorEnvelope),
        (status = CONFLICT, description = "The account already has a page, or the Instagram handle is taken", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn create_mine(
    State(state): State<AppState>,
    current: CurrentUser,
    ValidJson(fields): ValidJson<DancerFields>,
) -> Result<(StatusCode, Json<DancerResponse>), AppError> {
    check_new_titles(&fields, &current)?;
    // The unique index holds the rule against a race; this says it in words.
    if db::dancers::own_page(&state.pool, current.user.id)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("this account already has a page".into()));
    }
    let dancer = db::dancers::insert(
        &state.pool,
        &fields,
        DancerSource::SelfCreated,
        current.user.id,
    )
    .await?;
    let response = respond(&state, dancer, Some(&current)).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

/// A new page is unverified, so only `seed_admin`+ may say what its dancer does or hide their
/// Instagram.
fn check_new_titles(fields: &DancerFields, current: &CurrentUser) -> Result<(), AppError> {
    // Naming either, even empty or false, is saying it: the same rule as an update.
    let said = fields.titles.is_some() || fields.instagram_hidden.is_some();
    if said && current.user.role < Role::SeedAdmin {
        return Err(AppError::Forbidden);
    }
    Ok(())
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
        Unauthorized,
        (status = FORBIDDEN, description = "Not the creator (unverified), the owner (verified) nor `seed_admin`+; or titles or `instagram_hidden` from anyone but the verified owner and `seed_admin`+", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such dancer, or merged away", body = ErrorEnvelope),
        (status = CONFLICT, description = "Instagram handle already taken", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<DancerFields>,
) -> Result<Json<DancerResponse>, AppError> {
    save(&state, &current, id, Edit::Profile(&fields)).await
}

/// Replace a dancer's generated avatar, from its builder; logged like any edit.
#[utoipa::path(
    put,
    path = "/dancers/{id}/avatar",
    tag = "dancers",
    operation_id = "update_dancer_avatar",
    params(("id" = Uuid, Path, description = "Dancer id")),
    request_body = AvatarFields,
    security(("session" = [])),
    responses(
        (status = OK, body = DancerResponse),
        Unauthorized,
        (status = FORBIDDEN, description = "Not the creator (unverified), the owner (verified) nor `seed_admin`+", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such dancer, or merged away", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn update_avatar(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<AvatarFields>,
) -> Result<Json<DancerResponse>, AppError> {
    save(&state, &current, id, Edit::Avatar(&fields.avatar)).await
}

/// What an editor saves: the profile, or the avatar alone.
#[derive(Clone, Copy)]
enum Edit<'a> {
    Profile(&'a DancerFields),
    Avatar(&'a Value),
}

/// Writes an edit for whoever may make it, and logs it while the dancer is unverified.
async fn save(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
    edit: Edit<'_>,
) -> Result<Json<DancerResponse>, AppError> {
    let (pool, user) = (&state.pool, &current.user);
    let new = transaction::retrying(move || async move {
        let mut tx = transaction::begin(pool, MergeLock::Shared).await?;
        // Locked, so the logged change is against the version the update replaces.
        let old = db::dancers::find_for_update(&mut tx, id)
            .await?
            .filter(|d| d.merged_into_id.is_none())
            .ok_or(AppError::NotFound)?;
        if !old.can_edit(user) {
            return Err(AppError::Forbidden);
        }
        let new = match edit {
            Edit::Profile(fields) => write_profile(&mut tx, &old, user, fields).await?,
            Edit::Avatar(avatar) => db::dancers::set_avatar(&mut tx, id, avatar).await?,
        };
        // §4: every change to an unverified dancer is kept in `dancer_edits`.
        if old.verified_at.is_none() {
            let changes = dancer::changes(&old, &new);
            db::dancers::log_edits(&mut tx, id, user.id, &changes).await?;
        }
        tx.commit().await?;
        Ok(new)
    })
    .await?;
    respond(state, new, Some(current)).await.map(Json)
}

/// The profile as `user` may write it: titles and privacy are the dancer's own word.
async fn write_profile(
    tx: &mut PgConnection,
    old: &Dancer,
    user: &User,
    fields: &DancerFields,
) -> Result<Dancer, AppError> {
    let owner = old.can_set_titles(user);
    // A creator may fix the page, not say what the dancer does or hide their Instagram.
    if !owner && (fields.titles.is_some() || fields.instagram_hidden.is_some()) {
        return Err(AppError::Forbidden);
    }
    // An editor who is not shown a hidden handle sends none back: that is not clearing it.
    let handle = if old.instagram_hidden && !owner {
        &old.instagram_handle
    } else {
        &fields.instagram_handle
    };
    Ok(db::dancers::update(tx, old.id, fields, handle.as_deref()).await?)
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
        Unauthorized,
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

/// The public jams a dancer competed in or worked at, split into live, upcoming and past.
#[utoipa::path(
    get,
    path = "/dancers/{id}/events",
    tag = "dancers",
    operation_id = "dancer_events",
    params(("id" = Uuid, Path, description = "Dancer id")),
    responses(
        (status = OK, body = DancerEvents),
        (status = NOT_FOUND, description = "No such dancer", body = ErrorEnvelope),
    )
)]
async fn events(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<DancerEvents>, AppError> {
    db::dancers::find_live(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let rows = db::dancers::participations(&state.pool, id).await?;
    let [live, upcoming, past] = by_phase(rows, |p| p.event.phase);
    Ok(Json(DancerEvents {
        live,
        upcoming,
        past,
    }))
}

async fn respond(
    state: &AppState,
    mut dancer: Dancer,
    current: Option<&CurrentUser>,
) -> Result<DancerResponse, AppError> {
    let crews = db::dancers::current_crews(&state.pool, &[dancer.id])
        .await?
        .remove(&dancer.id)
        .unwrap_or_default();
    let can_edit = current.is_some_and(|c| dancer.can_edit(&c.user));
    let can_set_titles = current.is_some_and(|c| dancer.can_set_titles(&c.user));
    // A hidden handle goes to its owner and the team only (they edit it).
    if dancer.instagram_hidden && !can_set_titles {
        dancer.instagram_handle = None;
    }
    Ok(DancerResponse {
        dancer,
        crews,
        can_edit,
        can_set_titles,
    })
}
