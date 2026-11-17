//! `battle_requests` and `battle_request_members` queries (M32).

use std::collections::HashMap;

use sqlx::{PgConnection, PgExecutor, PgPool};
use uuid::Uuid;

use crate::domain::{
    claim::ClaimStatus,
    dancer::DancerRef,
    request::{BattleRequest, MyRequest, RequestMember, WaitingRequests},
};

/// A request to save: who asks, for which battle, and who would enter (the asker first).
pub struct NewRequest<'a> {
    /// The battle asked for.
    pub battle_id: Uuid,
    /// The account that asks.
    pub user_id: Uuid,
    /// Its verified page.
    pub dancer_id: Uuid,
    /// The team's name, if any.
    pub team_name: Option<&'a str>,
    /// Every member, the asker first.
    pub members: &'a [Uuid],
}

/// A request as the routes that act on it need it.
pub struct Found {
    /// Primary key.
    pub id: Uuid,
    /// The battle asked for.
    pub battle_id: Uuid,
    /// That battle's jam.
    pub event_id: Uuid,
    /// The account that asked.
    pub user_id: Uuid,
    /// The team's name, if any.
    pub team_name: Option<String>,
    /// Pending until answered.
    pub status: ClaimStatus,
    /// Every member, the asker first.
    pub members: Vec<Uuid>,
}

/// Whether `dancer_id` has a request waiting in this battle.
pub async fn pending_of(
    db: impl PgExecutor<'_>,
    battle_id: Uuid,
    dancer_id: Uuid,
) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(select 1 from battle_requests
                         where battle_id = $1 and dancer_id = $2 and status = 'pending') as "exists!""#,
        battle_id,
        dancer_id,
    )
    .fetch_one(db)
    .await
}

/// Counts an "asked to enter" email to the battle's organiser; `false`, and nothing counted, when
/// two went out today for this asker and battle.
pub async fn may_announce(pool: &PgPool, battle_id: Uuid, user_id: Uuid) -> sqlx::Result<bool> {
    // Cancelling and asking again is a new request each time: the cap keeps it from being spam.
    let counted = sqlx::query!(
        "insert into request_mails (battle_id, user_id) values ($1, $2)
         on conflict (battle_id, user_id) do update
           set sends = case when request_mails.day_started_at < now() - interval '1 day'
                            then 1 else request_mails.sends + 1 end,
               day_started_at = case when request_mails.day_started_at < now() - interval '1 day'
                                     then now() else request_mails.day_started_at end
           where request_mails.sends < 2
              or request_mails.day_started_at < now() - interval '1 day'",
        battle_id,
        user_id,
    )
    .execute(pool)
    .await?
    .rows_affected();
    Ok(counted > 0)
}

/// Saves a pending request with its members, in order.
pub async fn insert(conn: &mut PgConnection, request: &NewRequest<'_>) -> sqlx::Result<Uuid> {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into battle_requests (id, battle_id, user_id, dancer_id, team_name)
         values ($1, $2, $3, $4, $5)",
        id,
        request.battle_id,
        request.user_id,
        request.dancer_id,
        request.team_name,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "insert into battle_request_members (request_id, dancer_id, position)
         select $1, member, (n - 1)::smallint from unnest($2::uuid[]) with ordinality as m(member, n)",
        id,
        request.members,
    )
    .execute(conn)
    .await?;
    Ok(id)
}

/// Locks a request until the transaction ends, so it is answered once.
pub async fn lock(db: impl PgExecutor<'_>, id: Uuid) -> sqlx::Result<()> {
    // Locked apart from `find`: `for update` can't sit beside its aggregate.
    sqlx::query!(
        "select id from battle_requests where id = $1 for update",
        id
    )
    .fetch_optional(db)
    .await?;
    Ok(())
}

/// One request, with its members in order.
pub async fn find(db: impl PgExecutor<'_>, id: Uuid) -> sqlx::Result<Option<Found>> {
    let row = sqlx::query!(
        r#"select r.id, r.battle_id, b.event_id, r.user_id, r.team_name,
                  r.status as "status: ClaimStatus",
                  array(select m.dancer_id from battle_request_members m
                        where m.request_id = r.id order by m.position) as "members!"
           from battle_requests r join battles b on b.id = r.battle_id
           where r.id = $1"#,
        id,
    )
    .fetch_optional(db)
    .await?;
    Ok(row.map(|r| Found {
        id: r.id,
        battle_id: r.battle_id,
        event_id: r.event_id,
        user_id: r.user_id,
        team_name: r.team_name,
        status: r.status,
        members: r.members,
    }))
}

/// Answers a pending request; false when it wasn't pending any more.
pub async fn decide(
    db: impl PgExecutor<'_>,
    id: Uuid,
    status: ClaimStatus,
    by: Uuid,
) -> sqlx::Result<bool> {
    let done = sqlx::query!(
        "update battle_requests set status = $2, decided_by = $3, decided_at = now()
         where id = $1 and status = 'pending'",
        id,
        status as ClaimStatus,
        by,
    )
    .execute(db)
    .await?;
    Ok(done.rows_affected() == 1)
}

/// Deletes the asker's pending request; false when there was none to take back.
pub async fn cancel(db: impl PgExecutor<'_>, id: Uuid, user_id: Uuid) -> sqlx::Result<bool> {
    let done = sqlx::query!(
        "delete from battle_requests where id = $1 and user_id = $2 and status = 'pending'",
        id,
        user_id,
    )
    .execute(db)
    .await?;
    Ok(done.rows_affected() == 1)
}

/// The caller's latest request in each battle of a jam.
pub async fn mine(pool: &PgPool, event_id: Uuid, user_id: Uuid) -> sqlx::Result<Vec<MyRequest>> {
    sqlx::query_as!(
        MyRequest,
        r#"select distinct on (r.battle_id) r.id, r.battle_id, r.status as "status: ClaimStatus"
           from battle_requests r join battles b on b.id = r.battle_id
           where b.event_id = $1 and r.user_id = $2
           order by r.battle_id, r.created_at desc, r.id desc"#,
        event_id,
        user_id,
    )
    .fetch_all(pool)
    .await
}

/// The requests waiting in a jam's battles, oldest first, with their members.
pub async fn pending(pool: &PgPool, event_id: Uuid) -> sqlx::Result<Vec<BattleRequest>> {
    let rows = sqlx::query!(
        r#"select r.id, r.battle_id, r.team_name, r.created_at,
                  d.id as dancer_id, d.dancer_name, d.country, d.country2, d.instagram_handle,
                  d.avatar_url, d.avatar, d.deleted_at is not null as "deleted!",
                  d.instagram_hidden, d.verified_at is not null as "verified!"
           from battle_requests r
           join battles b on b.id = r.battle_id
           join battle_request_members m on m.request_id = r.id
           join dancers d on d.id = m.dancer_id
           where b.event_id = $1 and r.status = 'pending'
           order by r.created_at, r.id, m.position"#,
        event_id,
    )
    .fetch_all(pool)
    .await?;
    let mut requests: Vec<BattleRequest> = Vec::new();
    let mut at = HashMap::new();
    for r in rows {
        let index = *at.entry(r.id).or_insert_with(|| {
            requests.push(BattleRequest {
                id: r.id,
                battle_id: r.battle_id,
                team_name: r.team_name.clone(),
                created_at: r.created_at,
                members: Vec::new(),
            });
            requests.len() - 1
        });
        requests[index].members.push(RequestMember {
            dancer: DancerRef {
                id: r.dancer_id,
                dancer_name: r.dancer_name,
                country: r.country,
                country2: r.country2,
                instagram_handle: r.instagram_handle,
                avatar_url: r.avatar_url,
                avatar: r.avatar,
                deleted: r.deleted,
            },
            instagram_hidden: r.instagram_hidden,
            verified: r.verified,
        });
    }
    Ok(requests)
}

/// The caller's own jams with requests still to answer, soonest first: once a jam is over or
/// called off, its requests lapse.
pub async fn waiting(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Vec<WaitingRequests>> {
    sqlx::query_as!(
        WaitingRequests,
        r#"select e.id, e.name, e.slug, count(*) as "count!"
           from battle_requests r
           join battles b on b.id = r.battle_id
           join events e on e.id = b.event_id
           where e.organizer_id = $1 and e.deleted_at is null and r.status = 'pending'
             and e.status <> 'cancelled' and jam_phase(e.starts_on, e.ends_on, e.timezone) <> 'past'
           group by e.id
           order by e.starts_on, e.id"#,
        user_id,
    )
    .fetch_all(pool)
    .await
}
