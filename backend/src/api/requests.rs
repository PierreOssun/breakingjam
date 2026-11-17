//! Asking to enter a battle "with approval", and its organiser answering (M32).

use axum::{Json, extract::State, http::StatusCode};
use sqlx::PgConnection;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    battles::{check_entry, check_members, lock_battle},
    entering::{Recipient, enterable, locked, notify},
    events::{visible, writable},
    extract::{Path, ValidJson},
    transaction,
};
use crate::{
    auth::session::CurrentUser,
    db::{
        self,
        dancers::MergeLock,
        requests::{Found, NewRequest},
    },
    domain::{
        battle::{Battle, BattleRegistration, Entry, EntryFields},
        claim::ClaimStatus,
        request::{BattleRequest, MyRequest, RequestFields, WaitingRequests},
    },
    entry_mail::Notice,
    error::{AppError, ErrorEnvelope, InvalidFields, JamNotVisible, NotJamWriter, Unauthorized},
    state::AppState,
};

/// Request routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(ask))
        .routes(routes!(pending))
        .routes(routes!(mine))
        .routes(routes!(waiting))
        .routes(routes!(accept))
        .routes(routes!(decline))
        .routes(routes!(cancel))
}

/// Ask to enter a battle "with approval": alone, or as a team's captain with a full team.
#[utoipa::path(
    post,
    path = "/battles/{id}/requests",
    tag = "battles",
    operation_id = "ask_to_enter",
    params(("id" = Uuid, Path, description = "Battle id")),
    request_body = RequestFields,
    security(("session" = [])),
    responses(
        (status = CREATED, body = MyRequest),
        Unauthorized,
        (status = FORBIDDEN, description = "The account has no verified dancer page", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such battle, or its jam is a draft you can't see", body = ErrorEnvelope),
        (status = CONFLICT, description = "Not taking requests or registration closed (`conflict`), `already_requested`, `already_entered` or `battle_full`", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn ask(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(battle_id): Path<Uuid>,
    ValidJson(fields): ValidJson<RequestFields>,
) -> Result<(StatusCode, Json<MyRequest>), AppError> {
    let (battle, dancer) = enterable(&state, &current.user, battle_id).await?;
    let members: Vec<Uuid> = std::iter::once(dancer).chain(fields.teammates).collect();
    let request = NewRequest {
        battle_id,
        user_id: current.user.id,
        dancer_id: dancer,
        team_name: fields
            .team_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty()),
        members: &members,
    };
    let id = save_request(&state, battle.event_id, &request).await?;
    tell_request_sent(&state, &battle, &request).await;
    let status = ClaimStatus::Pending;
    Ok((
        StatusCode::CREATED,
        Json(MyRequest {
            id,
            battle_id,
            status,
        }),
    ))
}

/// The requests waiting in a jam's battles, oldest first: for its writers, who see each
/// member's Instagram handle even when the page hides it.
#[utoipa::path(
    get,
    path = "/events/{id}/requests",
    tag = "battles",
    operation_id = "list_requests",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses((status = OK, body = Vec<BattleRequest>), Unauthorized, NotJamWriter, JamNotVisible)
)]
async fn pending(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<BattleRequest>>, AppError> {
    writable(&state, &current, event_id).await?;
    Ok(Json(db::requests::pending(&state.pool, event_id).await?))
}

/// The caller's latest request in each battle of a jam: waiting, accepted or declined.
#[utoipa::path(
    get,
    path = "/events/{id}/requests/mine",
    tag = "battles",
    operation_id = "my_requests",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses((status = OK, body = Vec<MyRequest>), Unauthorized, JamNotVisible)
)]
async fn mine(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<MyRequest>>, AppError> {
    visible(&state, Some(&current.user), &event_id.to_string()).await?;
    Ok(Json(
        db::requests::mine(&state.pool, event_id, current.user.id).await?,
    ))
}

/// The caller's own jams with requests waiting, for the account menu.
#[utoipa::path(
    get,
    path = "/requests/waiting",
    tag = "battles",
    operation_id = "waiting_requests",
    security(("session" = [])),
    responses((status = OK, body = Vec<WaitingRequests>), Unauthorized)
)]
async fn waiting(
    State(state): State<AppState>,
    current: CurrentUser,
) -> Result<Json<Vec<WaitingRequests>>, AppError> {
    Ok(Json(
        db::requests::waiting(&state.pool, current.user.id).await?,
    ))
}

/// Accept a request: its dancers become a confirmed entry, and the asker is going.
#[utoipa::path(
    post,
    path = "/requests/{id}/accept",
    tag = "battles",
    operation_id = "accept_request",
    params(("id" = Uuid, Path, description = "Request id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Entry),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such request, or its jam is a draft you can't see", body = ErrorEnvelope),
        (status = CONFLICT, description = "Answered already (`conflict`), `already_entered` or `battle_full`", body = ErrorEnvelope),
        InvalidFields,
    )
)]
async fn accept(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Entry>, AppError> {
    let request = answerable(&state, &current, id).await?;
    let fields = EntryFields::confirmed(request.team_name.clone(), request.members.clone());
    let (pool, fields, request, by) = (&state.pool, &fields, &request, current.user.id);
    let (entry, battle) = transaction::retrying(move || async move {
        let mut tx = transaction::begin(pool, MergeLock::Shared).await?;
        // The battle first, as entry saves take it: places are counted one save at a time.
        let battle = lock_battle(&mut tx, request.battle_id).await?;
        still_pending(&mut tx, request.id).await?;
        AppError::check(fields.errors_for(&battle))?;
        check_members(&mut tx, &fields.dancer_ids, &[]).await?;
        check_entry(&mut tx, &battle, fields, None).await?;
        let entry = db::battles::insert_entry(&mut tx, battle.id, fields).await?;
        db::requests::decide(&mut *tx, request.id, ClaimStatus::Approved, by).await?;
        db::going::add(&mut *tx, request.event_id, request.user_id).await?;
        tx.commit().await?;
        Ok((entry, battle))
    })
    .await?;
    let entry = db::battles::find_entry(&mut *state.pool.acquire().await?, entry)
        .await?
        .ok_or(AppError::NotFound)?;
    let to = Recipient::Account(request.user_id);
    let notice = Notice::Accepted {
        team: request.members.len() > 1,
    };
    notify(&state, &battle, &[(notice, to)]).await;
    Ok(Json(entry))
}

/// Decline a request; the dancer sees it was declined.
#[utoipa::path(
    post,
    path = "/requests/{id}/decline",
    tag = "battles",
    operation_id = "decline_request",
    params(("id" = Uuid, Path, description = "Request id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Declined"),
        Unauthorized,
        NotJamWriter,
        (status = NOT_FOUND, description = "No such request, or its jam is a draft you can't see", body = ErrorEnvelope),
        (status = CONFLICT, description = "Answered already", body = ErrorEnvelope),
    )
)]
async fn decline(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let request = answerable(&state, &current, id).await?;
    let battle = db::battles::find(&state.pool, request.battle_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !db::requests::decide(
        &state.pool,
        request.id,
        ClaimStatus::Rejected,
        current.user.id,
    )
    .await?
    {
        return Err(answered());
    }
    let to = Recipient::Account(request.user_id);
    notify(&state, &battle, &[(Notice::Declined, to)]).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Take back your own request while it waits.
#[utoipa::path(
    delete,
    path = "/requests/{id}",
    tag = "battles",
    operation_id = "cancel_request",
    params(("id" = Uuid, Path, description = "Request id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Cancelled"),
        Unauthorized,
        (status = NOT_FOUND, description = "No waiting request of yours by that id", body = ErrorEnvelope),
    )
)]
async fn cancel(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    if !db::requests::cancel(&state.pool, id, current.user.id).await? {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Tells the asker that their request went out, and the organiser who asked (a team by its name;
/// twice a day at most).
async fn tell_request_sent(state: &AppState, battle: &Battle, request: &NewRequest<'_>) {
    let sent = (Notice::RequestSent, Recipient::Account(request.user_id));
    let who = match announced_as(state, request).await {
        Ok(who) => who,
        Err(error) => {
            tracing::warn!(%error, "could not prepare a request email");
            None
        }
    };
    match &who {
        Some(who) => {
            let asked = (Notice::Asked { who }, Recipient::Organiser);
            notify(state, battle, &[sent, asked]).await;
        }
        None => notify(state, battle, &[sent]).await,
    }
}

/// The name the organiser's email gives the request, unless two went out today for this asker
/// and battle.
async fn announced_as(state: &AppState, request: &NewRequest<'_>) -> sqlx::Result<Option<String>> {
    if !db::requests::may_announce(&state.pool, request.battle_id, request.user_id).await? {
        return Ok(None);
    }
    if let Some(team) = request.team_name {
        return Ok(Some(team.to_owned()));
    }
    let asker = db::dancers::find(&state.pool, request.dancer_id).await?;
    Ok(asker.map(|dancer| dancer.dancer_name))
}

/// Saves the request once the battle, read again under its lock, still takes it.
async fn save_request(
    state: &AppState,
    event_id: Uuid,
    request: &NewRequest<'_>,
) -> Result<Uuid, AppError> {
    let pool = &state.pool;
    transaction::retrying(move || async move {
        let mut tx = transaction::begin(pool, MergeLock::Shared).await?;
        let battle = locked(&mut tx, event_id, request.battle_id).await?;
        if battle.registration != BattleRegistration::Approval {
            return Err(AppError::Conflict(
                "this battle doesn't take requests".into(),
            ));
        }
        check_request(&mut tx, &battle, request).await?;
        let id = db::requests::insert(&mut tx, request).await?;
        tx.commit().await?;
        Ok(id)
    })
    .await
}

/// The request checked as the entry it would become, as `accept` checks it again: a full team
/// (one dancer for a solo battle, with no team name) of distinct live pages, none in the battle
/// yet, a place left; and no other request of the asker's waiting.
async fn check_request(
    conn: &mut PgConnection,
    battle: &Battle,
    request: &NewRequest<'_>,
) -> Result<(), AppError> {
    let fields = EntryFields::confirmed(None, request.members.to_vec());
    // The entry's rules speak of `dancer_ids`; the asker sent `teammates`.
    let errors = fields.errors_for(battle).into_iter();
    AppError::check(errors.map(|(_, message)| ("teammates", message)).collect())?;
    if let Some(name) = request.team_name {
        // The name heads the organiser's email: a solo battle has none, and no line breaks.
        if request.members.len() == 1 {
            return Err(AppError::invalid(
                "team_name",
                "a solo battle has no team name",
            ));
        }
        if name.chars().any(char::is_control) {
            return Err(AppError::invalid(
                "team_name",
                "control characters aren't allowed",
            ));
        }
    }
    check_members(conn, request.members, &[]).await?;
    if db::requests::pending_of(&mut *conn, battle.id, request.dancer_id).await? {
        return Err(AppError::AlreadyRequested);
    }
    check_entry(conn, battle, &fields, None).await
}

/// The request, if the caller writes its jam (403 otherwise, 404 when they can't see it).
async fn answerable(state: &AppState, current: &CurrentUser, id: Uuid) -> Result<Found, AppError> {
    let request = db::requests::find(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;
    writable(state, current, request.event_id).await?;
    Ok(request)
}

/// Locks the request and checks nobody answered it meanwhile.
async fn still_pending(conn: &mut PgConnection, id: Uuid) -> Result<(), AppError> {
    db::requests::lock(&mut *conn, id).await?;
    let request = db::requests::find(conn, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if request.status != ClaimStatus::Pending {
        return Err(answered());
    }
    Ok(())
}

fn answered() -> AppError {
    AppError::Conflict("this request was answered already".into())
}
