//! Organiser pages (on `app_users`) and `organizer_claims` queries.

use std::collections::HashMap;

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::{
    claim::{ClaimStatus, ClaimUser, new_code},
    dancer::EventRef,
    event::EventStatus,
    organizer::{
        Organizer, OrganizerClaim, OrganizerClaimForReview, OrganizerFields, OrganizerRef,
    },
};

/// An account's organiser page; only accounts that registered a jam (`organizer`+) have one.
pub async fn find(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Organizer>> {
    sqlx::query_as!(
        Organizer,
        r#"select id, display_name, instagram_handle, country, city, bio,
                  verified_at
           from app_users where id = $1 and role >= 'organizer'"#,
        id,
    )
    .fetch_optional(pool)
    .await
}

/// The organiser of a jam, for its page; none when the BreakingJam team entered it, since the
/// team lists jams it doesn't run.
pub async fn reference(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<OrganizerRef>> {
    sqlx::query_as!(
        OrganizerRef,
        r#"select id, display_name, instagram_handle, verified_at is not null as "verified!"
           from app_users where id = $1 and role not in ('seed_admin', 'admin')"#,
        id,
    )
    .fetch_optional(pool)
    .await
}

/// The organiser cards of `ids`, keyed by account id; team accounts have none, as in `reference`.
pub async fn references(pool: &PgPool, ids: &[Uuid]) -> sqlx::Result<HashMap<Uuid, OrganizerRef>> {
    let refs = sqlx::query_as!(
        OrganizerRef,
        r#"select id, display_name, instagram_handle, verified_at is not null as "verified!"
           from app_users where id = any($1) and role not in ('seed_admin', 'admin')"#,
        ids,
    )
    .fetch_all(pool)
    .await?;
    Ok(refs.into_iter().map(|r| (r.id, r)).collect())
}

/// Replaces the page's fields; a new handle drops the tick and the pending claim on the old one.
pub async fn update(
    conn: &mut PgConnection,
    id: Uuid,
    fields: &OrganizerFields,
) -> sqlx::Result<Organizer> {
    let organizer = sqlx::query_as!(
        Organizer,
        r#"update app_users set
             display_name = btrim($2),
             instagram_handle = nullif(lower(ltrim(btrim($3), '@')), ''),
             country = $4, city = nullif(btrim($5), ''), bio = nullif(btrim($6), ''),
             verified_at = case
               when instagram_handle is not distinct from nullif(lower(ltrim(btrim($3), '@')), '')
               then verified_at
             end
           where id = $1
           returning id, display_name, instagram_handle, country, city,
                     bio, verified_at"#,
        id,
        fields.display_name,
        fields.instagram_handle,
        fields.country,
        fields.city,
        fields.bio,
    )
    .fetch_one(&mut *conn)
    .await?;
    sqlx::query!(
        r#"update organizer_claims set status = 'rejected', reviewed_at = now()
           where user_id = $1 and status = 'pending'
             and instagram_handle is distinct from $2"#,
        id,
        organizer.instagram_handle,
    )
    .execute(conn)
    .await?;
    Ok(organizer)
}

/// The organiser's public jams (drafts and jams in review left out), oldest first, each flagged upcoming or not.
pub async fn events(pool: &PgPool, organizer_id: Uuid) -> sqlx::Result<Vec<(EventRef, bool)>> {
    let rows = sqlx::query!(
        r#"select id, name, slug, starts_on, ends_on, city, country,
                  status as "status: EventStatus", starts_on >= current_date as "upcoming!"
           from events
           where organizer_id = $1 and deleted_at is null and status not in ('draft', 'in_review')
           order by starts_on, id"#,
        organizer_id,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let event = EventRef {
                id: r.id,
                name: r.name,
                slug: r.slug,
                starts_on: r.starts_on,
                ends_on: r.ends_on,
                city: r.city,
                country: r.country,
                status: r.status,
            };
            (event, r.upcoming)
        })
        .collect())
}

/// Opens a pending claim on `handle`, or returns the one already pending.
pub async fn open_claim(
    pool: &PgPool,
    user_id: Uuid,
    handle: &str,
) -> sqlx::Result<OrganizerClaim> {
    let created = sqlx::query_as!(
        OrganizerClaim,
        r#"insert into organizer_claims (id, user_id, instagram_handle, code)
           values ($1, $2, $3, $4)
           on conflict (user_id) where status = 'pending' do nothing
           returning id, user_id, instagram_handle, code, status as "status: ClaimStatus",
                     reviewed_at, created_at"#,
        Uuid::now_v7(),
        user_id,
        handle,
        new_code(),
    )
    .fetch_optional(pool)
    .await?;
    match created {
        Some(claim) => Ok(claim),
        None => latest_claim(pool, user_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound),
    }
}

/// The organiser's most recent claim.
pub async fn latest_claim(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Option<OrganizerClaim>> {
    sqlx::query_as!(
        OrganizerClaim,
        r#"select id, user_id, instagram_handle, code, status as "status: ClaimStatus",
                  reviewed_at, created_at
           from organizer_claims where user_id = $1
           order by created_at desc, id desc limit 1"#,
        user_id,
    )
    .fetch_optional(pool)
    .await
}

/// The organiser review queue for one status, oldest first.
pub async fn list_claims(
    pool: &PgPool,
    status: ClaimStatus,
    window: super::Window,
) -> sqlx::Result<Vec<OrganizerClaimForReview>> {
    let rows = sqlx::query!(
        r#"select c.id, c.user_id, c.instagram_handle, c.code,
                  c.status as "status: ClaimStatus", c.reviewed_at, c.created_at,
                  u.email::text as "email!", u.display_name
           from organizer_claims c
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
        .map(|r| OrganizerClaimForReview {
            user: ClaimUser {
                id: r.user_id,
                email: r.email,
                display_name: r.display_name,
            },
            claim: OrganizerClaim {
                id: r.id,
                user_id: r.user_id,
                instagram_handle: r.instagram_handle,
                code: r.code,
                status: r.status,
                reviewed_at: r.reviewed_at,
                created_at: r.created_at,
            },
        })
        .collect())
}

/// Locks a claim for review.
pub async fn find_claim_for_update(
    conn: &mut PgConnection,
    id: Uuid,
) -> sqlx::Result<Option<OrganizerClaim>> {
    sqlx::query_as!(
        OrganizerClaim,
        r#"select id, user_id, instagram_handle, code, status as "status: ClaimStatus",
                  reviewed_at, created_at
           from organizer_claims where id = $1 for update"#,
        id,
    )
    .fetch_optional(conn)
    .await
}

/// Records the decision on one claim.
pub async fn decide_claim(
    conn: &mut PgConnection,
    id: Uuid,
    status: ClaimStatus,
    reviewer: Uuid,
) -> sqlx::Result<OrganizerClaim> {
    sqlx::query_as!(
        OrganizerClaim,
        r#"update organizer_claims set status = $2, reviewed_by = $3, reviewed_at = now()
           where id = $1
           returning id, user_id, instagram_handle, code, status as "status: ClaimStatus",
                     reviewed_at, created_at"#,
        id,
        status as ClaimStatus,
        reviewer,
    )
    .fetch_one(conn)
    .await
}

/// Ticks the organiser, if their handle is still the claimed one; false otherwise.
pub async fn verify(conn: &mut PgConnection, claim: &OrganizerClaim) -> sqlx::Result<bool> {
    let done = sqlx::query!(
        "update app_users set verified_at = now() where id = $1 and instagram_handle = $2",
        claim.user_id,
        claim.instagram_handle,
    )
    .execute(conn)
    .await?;
    Ok(done.rows_affected() == 1)
}
