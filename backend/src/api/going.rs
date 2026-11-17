//! `/events/{id}/going`: "I'm going" on a jam, and who is (M32).

use axum::{Json, extract::State};
use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::{
    events::{readable, visible},
    extract::Path,
};
use crate::{
    auth::session::{CurrentUser, MaybeUser},
    db,
    domain::{dancer::DancerRef, user::User},
    error::{AppError, JamNotVisible, NotTakingAttendees, Unauthorized},
    state::AppState,
};

/// `/events/{id}/going` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(who, add, remove))
}

/// How many are going to a jam, and whether the caller is.
#[derive(Debug, Default, Serialize, ToSchema)]
pub struct Going {
    /// Accounts that said they are going.
    pub going_count: i64,
    /// Whether the caller is one of them; false when logged out.
    pub going: bool,
}

impl Going {
    /// The jam's count, as `user` sees it.
    pub async fn of(pool: &PgPool, event_id: Uuid, user: Option<&User>) -> Result<Self, AppError> {
        let (going_count, going) = db::going::count(pool, event_id, user.map(|u| u.id)).await?;
        Ok(Self { going_count, going })
    }
}

/// Who is going: the verified dancers by name, and how many others.
#[derive(Debug, Serialize, ToSchema)]
pub struct GoingList {
    /// Accounts going, named or not.
    pub going_count: i64,
    /// The verified dancer pages of the accounts going.
    pub dancers: Vec<DancerRef>,
    /// Accounts going without a verified page: counted, never named.
    pub others: i64,
}

/// Who is going to a jam.
#[utoipa::path(
    get,
    path = "/events/{id}/going",
    tag = "events",
    operation_id = "list_going",
    params(("id" = Uuid, Path, description = "Jam id")),
    security((), ("session" = [])),
    responses((status = OK, body = GoingList), JamNotVisible)
)]
async fn who(
    State(state): State<AppState>,
    current: MaybeUser,
    Path(id): Path<Uuid>,
) -> Result<Json<GoingList>, AppError> {
    let event = readable(&state, &current, &id.to_string()).await?;
    let (going_count, dancers) = db::going::attendees(&state.pool, event.id).await?;
    let others = going_count - dancers.len() as i64;
    Ok(Json(GoingList {
        going_count,
        dancers,
        others,
    }))
}

/// Say you are going to a jam; saying it twice changes nothing.
#[utoipa::path(
    put,
    path = "/events/{id}/going",
    tag = "events",
    operation_id = "add_going",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Going),
        Unauthorized,
        JamNotVisible,
        NotTakingAttendees,
    )
)]
async fn add(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Going>, AppError> {
    let event = visible(&state, Some(&current.user), &id.to_string()).await?;
    if !event.takes_attendees() {
        return Err(AppError::Conflict(
            "the jam is not announced, called off or over".into(),
        ));
    }
    db::going::add(&state.pool, event.id, current.user.id).await?;
    Ok(Json(
        Going::of(&state.pool, event.id, Some(&current.user)).await?,
    ))
}

/// Take back "I'm going"; possible whatever the jam's state, so no one stays listed against
/// their will.
#[utoipa::path(
    delete,
    path = "/events/{id}/going",
    tag = "events",
    operation_id = "remove_going",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses((status = OK, body = Going), Unauthorized, JamNotVisible)
)]
async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Going>, AppError> {
    let event = visible(&state, Some(&current.user), &id.to_string()).await?;
    db::going::remove(&state.pool, event.id, current.user.id).await?;
    Ok(Json(
        Going::of(&state.pool, event.id, Some(&current.user)).await?,
    ))
}
