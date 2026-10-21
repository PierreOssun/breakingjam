//! Battles, entries and staff of a jam. Readable like the jam; writable by the jam's writers.

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    events::{readable, writable},
    json::ValidJson,
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db,
    domain::{
        battle::{
            Battle, BattleFields, BattleOrder, Entry, EntryFields, EntryStatus, StaffList,
            StaffMember, starts_during,
        },
        event::Event,
    },
    error::{AppError, ErrorEnvelope, InvalidFields, JamNotVisible, NotJamWriter, Unauthorized},
    state::AppState,
};

/// Battle, entry and staff routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(reorder))
        .routes(routes!(update, remove))
        .routes(routes!(list_entries, create_entry))
        .routes(routes!(update_entry, remove_entry))
        .routes(routes!(list_staff, replace_staff))
}

/// A jam's battles in display order.
#[utoipa::path(
    get,
    path = "/events/{id}/battles",
    tag = "battles",
    operation_id = "list_battles",
    params(("id" = Uuid, Path, description = "Jam id")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = Vec<Battle>),
        JamNotVisible,
    )
)]
async fn list(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<Battle>>, AppError> {
    readable(&state, &current, &event_id.to_string()).await?;
    Ok(Json(db::battles::list(&state.pool, event_id).await?))
}

/// Add a battle at the end; a blank name is generated.
#[utoipa::path(
    post,
    path = "/events/{id}/battles",
    tag = "battles",
    operation_id = "create_battle",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body = BattleFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = Battle),
        Unauthorized,
        NotJamWriter,
        JamNotVisible,
        InvalidFields,
    )
)]
async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(event_id): Path<Uuid>,
    ValidJson(fields): ValidJson<BattleFields>,
) -> Result<(StatusCode, Json<Battle>), AppError> {
    let event = writable(&state, &current, event_id).await?;
    check_start(&fields, &event)?;
    let battle =
        db::battles::insert(&state.pool, event_id, &fields.display_name(), &fields).await?;
    Ok((StatusCode::CREATED, Json(battle)))
}

/// Replace a battle's fields (not its position).
#[utoipa::path(
    put,
    path = "/battles/{id}",
    tag = "battles",
    operation_id = "update_battle",
    params(("id" = Uuid, Path, description = "Battle id")),
    request_body = BattleFields,
    security(("session" = [])),
    responses(
        (status = OK, body = Battle),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such battle, or its jam is a draft you can't see", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<BattleFields>,
) -> Result<Json<Battle>, AppError> {
    let (_, event) = writable_battle(&state, &current, id).await?;
    check_start(&fields, &event)?;
    let battle = db::battles::update(&state.pool, id, &fields.display_name(), &fields).await?;
    Ok(Json(battle))
}

/// Delete a battle and its entries.
#[utoipa::path(
    delete,
    path = "/battles/{id}",
    tag = "battles",
    operation_id = "delete_battle",
    params(("id" = Uuid, Path, description = "Battle id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Deleted"),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such battle, or its jam is a draft you can't see", body = ErrorEnvelope),
    )
)]
async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    writable_battle(&state, &current, id).await?;
    db::battles::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Set the display order; must list every battle of the jam once.
#[utoipa::path(
    put,
    path = "/events/{id}/battles/order",
    tag = "battles",
    operation_id = "reorder_battles",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body = BattleOrder,
    security(("session" = [])),
    responses(
        (status = OK, body = Vec<Battle>),
        Unauthorized,
        NotJamWriter,
        JamNotVisible,
        (status = UNPROCESSABLE_ENTITY, description = "Not exactly the jam's battles", body = ErrorEnvelope),
    )
)]
async fn reorder(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(event_id): Path<Uuid>,
    ValidJson(BattleOrder(ids)): ValidJson<BattleOrder>,
) -> Result<Json<Vec<Battle>>, AppError> {
    writable(&state, &current, event_id).await?;
    let mut current_ids: Vec<Uuid> = db::battles::list(&state.pool, event_id)
        .await?
        .iter()
        .map(|b| b.id)
        .collect();
    let mut wanted = ids.clone();
    current_ids.sort();
    wanted.sort();
    if current_ids != wanted {
        return Err(AppError::invalid(
            "battle_ids",
            "must list every battle of the jam once",
        ));
    }
    db::battles::reorder(&state.pool, event_id, &ids).await?;
    Ok(Json(db::battles::list(&state.pool, event_id).await?))
}

/// A battle's entries with members and results.
#[utoipa::path(
    get,
    path = "/battles/{id}/entries",
    tag = "battles",
    operation_id = "list_entries",
    params(("id" = Uuid, Path, description = "Battle id")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = Vec<Entry>),
        (status = NOT_FOUND, description = "No such battle, or its jam is a draft you can't see", body = ErrorEnvelope),
    )
)]
async fn list_entries(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(battle_id): Path<Uuid>,
) -> Result<Json<Vec<Entry>>, AppError> {
    let battle = db::battles::find(&state.pool, battle_id)
        .await?
        .ok_or(AppError::NotFound)?;
    readable(&state, &current, &battle.event_id.to_string()).await?;
    Ok(Json(db::battles::entries(&state.pool, battle_id).await?))
}

/// Register an entry; results may be set at once for past jams.
#[utoipa::path(
    post,
    path = "/battles/{id}/entries",
    tag = "battles",
    operation_id = "create_entry",
    params(("id" = Uuid, Path, description = "Battle id")),
    request_body = EntryFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = Entry),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such battle, or its jam is a draft you can't see", body = ErrorEnvelope),
        (status = CONFLICT, description = "A dancer is already entered in this battle, or the battle is full", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn create_entry(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(battle_id): Path<Uuid>,
    ValidJson(mut fields): ValidJson<EntryFields>,
) -> Result<(StatusCode, Json<Entry>), AppError> {
    let (battle, _) = writable_battle(&state, &current, battle_id).await?;
    check_entry(&state, &battle, &mut fields, None).await?;
    let mut tx = state.pool.begin().await?;
    let id = db::battles::insert_entry(&mut tx, battle_id, battle.gender, &fields).await?;
    tx.commit().await?;
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok((StatusCode::CREATED, Json(entry)))
}

/// Replace an entry, its members and its result.
#[utoipa::path(
    put,
    path = "/entries/{id}",
    tag = "battles",
    operation_id = "update_entry",
    params(("id" = Uuid, Path, description = "Entry id")),
    request_body = EntryFields,
    security(("session" = [])),
    responses(
        (status = OK, body = Entry),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such entry, or its jam is a draft you can't see", body = ErrorEnvelope),
        (status = CONFLICT, description = "A dancer is already entered in this battle, or the battle is full", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn update_entry(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(mut fields): ValidJson<EntryFields>,
) -> Result<Json<Entry>, AppError> {
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let (battle, _) = writable_battle(&state, &current, entry.battle_id).await?;
    check_entry(&state, &battle, &mut fields, Some(id)).await?;
    let mut tx = state.pool.begin().await?;
    db::battles::update_entry(&mut tx, id, battle.gender, &fields).await?;
    tx.commit().await?;
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(entry))
}

/// Delete an entry.
#[utoipa::path(
    delete,
    path = "/entries/{id}",
    tag = "battles",
    operation_id = "delete_entry",
    params(("id" = Uuid, Path, description = "Entry id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Deleted"),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such entry, or its jam is a draft you can't see", body = ErrorEnvelope),
    )
)]
async fn remove_entry(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    writable_battle(&state, &current, entry.battle_id).await?;
    db::battles::delete_entry(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// A jam's judges, DJs, MCs and other staff.
#[utoipa::path(
    get,
    path = "/events/{id}/staff",
    tag = "battles",
    operation_id = "list_staff",
    params(("id" = Uuid, Path, description = "Jam id")),
    security((), ("session" = [])),
    responses(
        (status = OK, body = Vec<StaffMember>),
        JamNotVisible,
    )
)]
async fn list_staff(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<StaffMember>>, AppError> {
    readable(&state, &current, &event_id.to_string()).await?;
    Ok(Json(db::events::staff(&state.pool, event_id).await?))
}

/// Replace a jam's whole staff list.
#[utoipa::path(
    put,
    path = "/events/{id}/staff",
    tag = "battles",
    operation_id = "replace_staff",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body = StaffList,
    security(("session" = [])),
    responses(
        (status = OK, body = Vec<StaffMember>),
        Unauthorized,
        NotJamWriter,
        JamNotVisible,
        InvalidFields,
    )
)]
async fn replace_staff(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(event_id): Path<Uuid>,
    ValidJson(StaffList(staff)): ValidJson<StaffList>,
) -> Result<Json<Vec<StaffMember>>, AppError> {
    writable(&state, &current, event_id).await?;
    let mut dancer_ids: Vec<Uuid> = staff.iter().map(|s| s.dancer_id).collect();
    dancer_ids.sort();
    dancer_ids.dedup();
    if db::dancers::count_live(&state.pool, &dancer_ids).await? != dancer_ids.len() as i64 {
        return Err(AppError::invalid("staff", "unknown dancer"));
    }
    let mut tx = state.pool.begin().await?;
    db::events::replace_staff(&mut tx, event_id, &staff).await?;
    tx.commit().await?;
    Ok(Json(db::events::staff(&state.pool, event_id).await?))
}

/// The battle if `current` may write its jam.
async fn writable_battle(
    state: &AppState,
    current: &CurrentUser,
    id: Uuid,
) -> Result<(Battle, Event), AppError> {
    let battle = db::battles::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let event = writable(state, current, battle.event_id).await?;
    Ok((battle, event))
}

/// A battle starts on one of its jam's days, or has no start yet.
fn check_start(fields: &BattleFields, event: &Event) -> Result<(), AppError> {
    if starts_during(fields.starts_at, event.starts_on, event.ends_on) {
        Ok(())
    } else {
        Err(AppError::invalid(
            "starts_at",
            "must be on one of the jam's days",
        ))
    }
}

/// Normalises the entry, then checks the §4 rules: domain, referenced rows, one entry per
/// dancer per battle and `max_entries`; a withdrawn entry only needs the first two.
async fn check_entry(
    state: &AppState,
    battle: &Battle,
    fields: &mut EntryFields,
    except_entry: Option<Uuid>,
) -> Result<(), AppError> {
    fields.normalize();
    AppError::check(fields.errors_for(battle))?;
    if db::dancers::count_live(&state.pool, &fields.dancer_ids).await?
        != fields.dancer_ids.len() as i64
    {
        return Err(AppError::invalid("dancer_ids", "unknown dancer"));
    }
    if let Some(crew_id) = fields.crew_id
        && db::crews::find(&state.pool, crew_id).await?.is_none()
    {
        return Err(AppError::invalid("crew_id", "unknown crew"));
    }
    if fields.status == EntryStatus::Withdrawn {
        return Ok(());
    }
    if db::battles::already_entered(&state.pool, battle.id, &fields.dancer_ids, except_entry)
        .await?
    {
        return Err(AppError::Conflict(
            "a dancer is already entered in this battle".into(),
        ));
    }
    if let Some(max) = battle.max_entries
        && db::battles::active_entry_count(&state.pool, battle.id, except_entry).await?
            >= i64::from(max)
    {
        return Err(AppError::Conflict("battle is full".into()));
    }
    Ok(())
}
