//! `/battles/{id}/enter`: a verified dancer enters an open battle, or leaves it (M32).

use axum::{Json, extract::State, http::StatusCode};
use sqlx::PgConnection;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    battles::{check_entry, lock_battle, lock_jam},
    events::visible,
    extract::Path,
    transaction,
};
use crate::{
    auth::session::CurrentUser,
    db::{self, dancers::MergeLock},
    domain::{
        battle::{Battle, BattleRegistration, Entry, EntryFields},
        user::User,
    },
    entry_mail::{BattleNews, Notice},
    error::{AppError, ErrorEnvelope, Unauthorized},
    mail::Message,
    state::AppState,
};

/// `/battles/{id}/enter` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(enter, leave))
}

/// Enter an open battle as yourself: your verified page, confirmed at once; you're going too.
#[utoipa::path(
    post,
    path = "/battles/{id}/enter",
    tag = "battles",
    operation_id = "enter_battle",
    params(("id" = Uuid, Path, description = "Battle id")),
    security(("session" = [])),
    responses(
        (status = CREATED, body = Entry),
        Unauthorized,
        (status = FORBIDDEN, description = "The account has no verified dancer page", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such battle, or its jam is a draft you can't see", body = ErrorEnvelope),
        (status = CONFLICT, description = "Not open to enter or registration closed (`conflict`), in already (`already_entered`), or full (`battle_full`)", body = ErrorEnvelope),
    )
)]
async fn enter(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(battle_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Entry>), AppError> {
    let (battle, dancer) = enterable(&state, &current.user, battle_id).await?;
    let id = insert_own_entry(&state, &battle, &EntryFields::solo(dancer), current.user.id).await?;
    let entry = db::battles::find_entry(&mut *state.pool.acquire().await?, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(who) = entry.members.first() {
        let notice = Notice::Entered {
            who: &who.dancer_name,
        };
        notify(&state, &battle, &[(notice, Recipient::Organiser)]).await;
    }
    Ok((StatusCode::CREATED, Json(entry)))
}

/// Leave a battle you entered, or were entered in alone, while registration is open; you stay
/// going to the jam.
#[utoipa::path(
    delete,
    path = "/battles/{id}/enter",
    tag = "battles",
    operation_id = "leave_battle",
    params(("id" = Uuid, Path, description = "Battle id")),
    security(("session" = [])),
    responses(
        (status = NO_CONTENT, description = "Left"),
        Unauthorized,
        (status = FORBIDDEN, description = "The account has no verified dancer page", body = ErrorEnvelope),
        (status = NOT_FOUND, description = "No such battle, or you are not in it", body = ErrorEnvelope),
        (status = CONFLICT, description = "Registration closed, the organiser adds its dancers, or a team entry", body = ErrorEnvelope),
    )
)]
async fn leave(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(battle_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (battle, dancer) = enterable(&state, &current.user, battle_id).await?;
    let (pool, event_id) = (&state.pool, battle.event_id);
    transaction::retrying(move || async move {
        let mut tx = transaction::begin(pool, MergeLock::Shared).await?;
        // Under the locks an organiser's save takes too: the entry can't gain teammates, nor
        // the battle change hands, between this check and the delete.
        let battle = locked(&mut tx, event_id, battle_id).await?;
        if battle.registration == BattleRegistration::Organizer {
            return Err(AppError::Conflict(
                "the organiser adds this battle's dancers".into(),
            ));
        }
        let (entry, members) = db::battles::entry_of(&mut *tx, battle_id, dancer)
            .await?
            .ok_or(AppError::NotFound)?;
        if members > 1 {
            return Err(AppError::Conflict(
                "a team leaves through the organiser".into(),
            ));
        }
        db::battles::delete_entry(&mut *tx, entry).await?;
        Ok(tx.commit().await?)
    })
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The battle, if the caller can see its jam, and the caller's verified page.
pub(super) async fn enterable(
    state: &AppState,
    user: &User,
    battle_id: Uuid,
) -> Result<(Battle, Uuid), AppError> {
    let battle = db::battles::find(&state.pool, battle_id)
        .await?
        .ok_or(AppError::NotFound)?;
    visible(state, Some(user), &battle.event_id.to_string()).await?;
    let dancer = db::dancers::verified_page(&state.pool, user.id)
        .await?
        .ok_or(AppError::Forbidden)?;
    Ok((battle, dancer))
}

/// Inserts the dancer's own entry and marks the account as going, once the battle, read again
/// under its lock, is still open and has a place.
async fn insert_own_entry(
    state: &AppState,
    battle: &Battle,
    fields: &EntryFields,
    user_id: Uuid,
) -> Result<Uuid, AppError> {
    let (pool, event_id, battle_id) = (&state.pool, battle.event_id, battle.id);
    transaction::retrying(move || async move {
        let mut tx = transaction::begin(pool, MergeLock::Shared).await?;
        let battle = locked(&mut tx, event_id, battle_id).await?;
        if battle.registration != BattleRegistration::Open {
            return Err(AppError::Conflict(
                "this battle is not open to enter".into(),
            ));
        }
        check_entry(&mut tx, &battle, fields, None).await?;
        let id = db::battles::insert_entry(&mut tx, battle_id, fields).await?;
        db::going::add(&mut *tx, event_id, user_id).await?;
        tx.commit().await?;
        Ok(id)
    })
    .await
}

/// Locks the jam, then the battle (the order a battle's save takes them), and checks that the
/// jam still takes entries: its organiser may have closed registration a moment ago.
pub(super) async fn locked(
    conn: &mut PgConnection,
    event_id: Uuid,
    battle_id: Uuid,
) -> Result<Battle, AppError> {
    if !lock_jam(conn, event_id).await?.takes_entries() {
        return Err(AppError::Conflict("registration is closed".into()));
    }
    lock_battle(conn, battle_id).await
}

/// Who a battle email goes to.
#[derive(Debug, Clone, Copy)]
pub(super) enum Recipient {
    /// The jam's organiser, at their login email.
    Organiser,
    /// This account: the dancer who entered or asked.
    Account(Uuid),
}

/// Emails each recipient their notice about `battle`, in their language, once the change is
/// saved; the jam is read once for all. What it can't read is logged, never the request's error:
/// the change stands.
pub(super) async fn notify(state: &AppState, battle: &Battle, mails: &[(Notice<'_>, Recipient)]) {
    if let Err(error) = send_news(state, battle, mails).await {
        tracing::warn!(%error, "could not prepare a battle email");
    }
}

async fn send_news(
    state: &AppState,
    battle: &Battle,
    mails: &[(Notice<'_>, Recipient)],
) -> sqlx::Result<()> {
    let Some(event) = db::events::find(&state.pool, &battle.event_id.to_string()).await? else {
        return Ok(());
    };
    let base = state.config.app_base_url.trim_end_matches('/');
    let place = [event.venue_name, event.city]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let news = BattleNews {
        jam: event.name,
        battle: battle.name.clone(),
        link: format!("{base}/jams/{}", event.slug),
        day: battle.starts_at.map_or(event.starts_on, |at| at.date()),
        starts: battle.starts_at.map(|at| at.time()),
        place: (!place.is_empty()).then(|| place.join(", ")),
    };
    for &(notice, to) in mails {
        let account = match to {
            Recipient::Organiser => event.organizer_id,
            Recipient::Account(id) => id,
        };
        if let Some((email, language)) = db::users::mail_to(&state.pool, account).await? {
            let message = Message::battle(notice, language, &email, &news);
            state.mail.send_later(message, "battle");
        }
    }
    Ok(())
}
