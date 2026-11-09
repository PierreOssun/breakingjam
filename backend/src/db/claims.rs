//! `dancer_claims` queries, and the history of every claim decision.

use sqlx::{PgConnection, PgExecutor, PgPool};
use uuid::Uuid;

use crate::domain::{
    claim::{Claim, ClaimDecision, ClaimForReview, ClaimStatus, ClaimUser, new_code},
    dancer::DancerRef,
};

/// Opens a pending claim, or returns the one this user already has on the dancer.
pub async fn open(conn: &mut PgConnection, dancer_id: Uuid, user_id: Uuid) -> sqlx::Result<Claim> {
    let created = sqlx::query_as!(
        Claim,
        r#"insert into dancer_claims (id, dancer_id, user_id, code)
           values ($1, $2, $3, $4)
           on conflict (dancer_id, user_id) where status = 'pending' do nothing
           returning id, dancer_id, user_id, code, status as "status: ClaimStatus",
                     reviewed_at, created_at"#,
        Uuid::now_v7(),
        dancer_id,
        user_id,
        new_code(),
    )
    .fetch_optional(&mut *conn)
    .await?;
    match created {
        Some(claim) => Ok(claim),
        None => latest(conn, dancer_id, user_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound),
    }
}

/// The user's most recent claim on the dancer.
pub async fn latest(
    db: impl PgExecutor<'_>,
    dancer_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<Claim>> {
    sqlx::query_as!(
        Claim,
        r#"select id, dancer_id, user_id, code, status as "status: ClaimStatus",
                  reviewed_at, created_at
           from dancer_claims where dancer_id = $1 and user_id = $2
           order by created_at desc, id desc limit 1"#,
        dancer_id,
        user_id,
    )
    .fetch_optional(db)
    .await
}

/// Whether another account has a pending claim on the dancer (DESIGN.md §6 verify modal).
pub async fn others_pending(pool: &PgPool, dancer_id: Uuid, user_id: Uuid) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(
             select 1 from dancer_claims
             where dancer_id = $1 and user_id <> $2 and status = 'pending'
           ) as "exists!""#,
        dancer_id,
        user_id,
    )
    .fetch_one(pool)
    .await
}

/// The review queue for one status, oldest first.
pub async fn list(
    pool: &PgPool,
    status: ClaimStatus,
    window: super::Window,
) -> sqlx::Result<Vec<ClaimForReview>> {
    let rows = sqlx::query!(
        r#"select c.id, c.dancer_id, c.user_id, c.code, c.status as "status: ClaimStatus",
                  c.reviewed_at, c.created_at,
                  d.dancer_name, d.country, d.country2, d.instagram_handle,
                  d.avatar_url, d.avatar_parts, d.deleted_at is not null as "deleted!",
                  u.email::text as "email!", u.display_name
           from dancer_claims c
           join dancers d on d.id = c.dancer_id
           join app_users u on u.id = c.user_id
           where c.status = $1
           order by c.created_at, c.id
           limit $2 offset $3"#,
        status as ClaimStatus,
        window.limit,
        window.offset,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| ClaimForReview {
            dancer: DancerRef {
                id: r.dancer_id,
                dancer_name: r.dancer_name,
                country: r.country,
                country2: r.country2,
                instagram_handle: r.instagram_handle,
                avatar_url: r.avatar_url,
                avatar_parts: r.avatar_parts,
                deleted: r.deleted,
            },
            user: ClaimUser {
                id: r.user_id,
                email: r.email,
                display_name: r.display_name,
            },
            claim: Claim {
                id: r.id,
                dancer_id: r.dancer_id,
                user_id: r.user_id,
                code: r.code,
                status: r.status,
                reviewed_at: r.reviewed_at,
                created_at: r.created_at,
            },
        })
        .collect())
}

/// Every decided claim, on dancer and organiser pages alike, the most recent decision first (M31).
pub async fn history(pool: &PgPool, window: super::Window) -> sqlx::Result<Vec<ClaimDecision>> {
    let rows = sqlx::query!(
        r#"select c.id as "id!", c.status as "status!: ClaimStatus", c.decided_at as "decided_at!",
                  c.admin_email, c.user_id as "user_id!", u.email::text as "email!",
                  u.display_name as "display_name!", c.instagram_handle,
                  d.id as "dancer_id?", d.dancer_name as "dancer_name?", d.country as "country?",
                  d.country2, d.avatar_url, d.avatar_parts,
                  d.deleted_at is not null as "deleted?"
           from (
             select c.id, c.status, coalesce(c.reviewed_at, c.created_at) as decided_at,
                    a.email::text as admin_email, c.user_id, c.dancer_id,
                    d.instagram_handle
             from dancer_claims c
             join dancers d on d.id = c.dancer_id
             left join app_users a on a.id = c.reviewed_by
             where c.status <> 'pending'
             union all
             select c.id, c.status, coalesce(c.reviewed_at, c.created_at),
                    a.email::text, c.user_id, null, c.instagram_handle
             from organizer_claims c
             left join app_users a on a.id = c.reviewed_by
             where c.status <> 'pending'
           ) c
           join app_users u on u.id = c.user_id
           left join dancers d on d.id = c.dancer_id
           order by c.decided_at desc, c.id desc
           limit $1 offset $2"#,
        window.limit,
        window.offset,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let dancer = match (r.dancer_id, r.dancer_name, r.country) {
                (Some(id), Some(dancer_name), Some(country)) => Some(DancerRef {
                    id,
                    dancer_name,
                    country,
                    country2: r.country2,
                    instagram_handle: r.instagram_handle.clone(),
                    avatar_url: r.avatar_url,
                    avatar_parts: r.avatar_parts,
                    deleted: r.deleted.unwrap_or_default(),
                }),
                _ => None,
            };
            ClaimDecision {
                id: r.id,
                status: r.status,
                decided_at: r.decided_at,
                admin_email: r.admin_email,
                user: ClaimUser {
                    id: r.user_id,
                    email: r.email,
                    display_name: r.display_name,
                },
                instagram_handle: r.instagram_handle,
                dancer,
            }
        })
        .collect())
}

/// The dancer a claim is on; a merge may move it until the claim is locked.
pub async fn dancer_of(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar!("select dancer_id from dancer_claims where id = $1", id)
        .fetch_optional(conn)
        .await
}

/// Locks a claim for review.
pub async fn find_for_update(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Claim>> {
    sqlx::query_as!(
        Claim,
        r#"select id, dancer_id, user_id, code, status as "status: ClaimStatus",
                  reviewed_at, created_at
           from dancer_claims where id = $1 for update"#,
        id,
    )
    .fetch_optional(conn)
    .await
}

/// Records the decision on one claim.
pub async fn decide(
    conn: &mut PgConnection,
    id: Uuid,
    status: ClaimStatus,
    reviewer: Uuid,
) -> sqlx::Result<Claim> {
    sqlx::query_as!(
        Claim,
        r#"update dancer_claims set status = $2, reviewed_by = $3, reviewed_at = now()
           where id = $1
           returning id, dancer_id, user_id, code, status as "status: ClaimStatus",
                     reviewed_at, created_at"#,
        id,
        status as ClaimStatus,
        reviewer,
    )
    .fetch_one(conn)
    .await
}

/// Approval side effects: the dancer gets its owner, competing pending claims are rejected.
pub async fn grant_ownership(
    conn: &mut PgConnection,
    claim: &Claim,
    reviewer: Uuid,
) -> sqlx::Result<()> {
    sqlx::query!(
        "update dancers set user_id = $2, verified_at = now() where id = $1",
        claim.dancer_id,
        claim.user_id,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "update dancer_claims set status = 'rejected', reviewed_by = $3, reviewed_at = now()
         where dancer_id = $1 and status = 'pending' and id <> $2",
        claim.dancer_id,
        claim.id,
        reviewer,
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
