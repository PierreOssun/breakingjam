//! `dancer_claims` queries.

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::{
    claim::{Claim, ClaimForReview, ClaimStatus, ClaimUser, new_code},
    dancer::DancerRef,
};

/// Opens a pending claim, or returns the one this user already has on the dancer.
pub async fn open(pool: &PgPool, dancer_id: Uuid, user_id: Uuid) -> sqlx::Result<Claim> {
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
    .fetch_optional(pool)
    .await?;
    match created {
        Some(claim) => Ok(claim),
        None => latest(pool, dancer_id, user_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound),
    }
}

/// The user's most recent claim on the dancer.
pub async fn latest(pool: &PgPool, dancer_id: Uuid, user_id: Uuid) -> sqlx::Result<Option<Claim>> {
    sqlx::query_as!(
        Claim,
        r#"select id, dancer_id, user_id, code, status as "status: ClaimStatus",
                  reviewed_at, created_at
           from dancer_claims where dancer_id = $1 and user_id = $2
           order by created_at desc, id desc limit 1"#,
        dancer_id,
        user_id,
    )
    .fetch_optional(pool)
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
