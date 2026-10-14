//! Battles, entries and staff of a jam. Readable like the jam; writable by the jam's writers.

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, put},
};
use uuid::Uuid;

use super::{
    events::{readable, writable},
    json::ValidJson,
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db,
    domain::battle::{
        Battle, BattleFields, BattleOrder, Entry, EntryFields, EntryStatus, StaffList, StaffMember,
    },
    error::AppError,
    state::AppState,
};

/// Battle, entry and staff routes.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/events/{id}/battles", get(list).post(create))
        .route("/events/{id}/battles/order", put(reorder))
        .route("/battles/{id}", put(update).delete(remove))
        .route(
            "/battles/{id}/entries",
            get(list_entries).post(create_entry),
        )
        .route("/entries/{id}", put(update_entry).delete(remove_entry))
        .route("/events/{id}/staff", get(list_staff).put(replace_staff))
}

async fn list(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<Battle>>, AppError> {
    readable(&state, &current, event_id).await?;
    Ok(Json(db::battles::list(&state.pool, event_id).await?))
}

async fn create(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(event_id): Path<Uuid>,
    ValidJson(fields): ValidJson<BattleFields>,
) -> Result<(StatusCode, Json<Battle>), AppError> {
    writable(&state, &current, event_id).await?;
    AppError::check(fields.cross_field_errors())?;
    let battle =
        db::battles::insert(&state.pool, event_id, &fields.display_name(), &fields).await?;
    Ok((StatusCode::CREATED, Json(battle)))
}

async fn update(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(fields): ValidJson<BattleFields>,
) -> Result<Json<Battle>, AppError> {
    writable_battle(&state, &current, id).await?;
    AppError::check(fields.cross_field_errors())?;
    let battle = db::battles::update(&state.pool, id, &fields.display_name(), &fields).await?;
    Ok(Json(battle))
}

async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    writable_battle(&state, &current, id).await?;
    db::battles::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

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

async fn list_entries(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(battle_id): Path<Uuid>,
) -> Result<Json<Vec<Entry>>, AppError> {
    let battle = db::battles::find(&state.pool, battle_id)
        .await?
        .ok_or(AppError::NotFound)?;
    readable(&state, &current, battle.event_id).await?;
    Ok(Json(db::battles::entries(&state.pool, battle_id).await?))
}

async fn create_entry(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(battle_id): Path<Uuid>,
    ValidJson(mut fields): ValidJson<EntryFields>,
) -> Result<(StatusCode, Json<Entry>), AppError> {
    let battle = writable_battle(&state, &current, battle_id).await?;
    check_entry(&state, &battle, &mut fields, None).await?;
    let mut tx = state.pool.begin().await?;
    let id = db::battles::insert_entry(&mut tx, battle_id, &fields).await?;
    tx.commit().await?;
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok((StatusCode::CREATED, Json(entry)))
}

async fn update_entry(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    ValidJson(mut fields): ValidJson<EntryFields>,
) -> Result<Json<Entry>, AppError> {
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    let battle = writable_battle(&state, &current, entry.battle_id).await?;
    check_entry(&state, &battle, &mut fields, Some(id)).await?;
    let mut tx = state.pool.begin().await?;
    db::battles::update_entry(&mut tx, id, &fields).await?;
    tx.commit().await?;
    let entry = db::battles::find_entry(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(entry))
}

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

async fn list_staff(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<StaffMember>>, AppError> {
    readable(&state, &current, event_id).await?;
    Ok(Json(db::events::staff(&state.pool, event_id).await?))
}

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
) -> Result<Battle, AppError> {
    let battle = db::battles::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    writable(state, current, battle.event_id).await?;
    Ok(battle)
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
