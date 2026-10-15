//! Counts for the admin overview.

use serde::Serialize;
use sqlx::PgPool;
use utoipa::ToSchema;

/// What the site holds and what waits for an admin; percentages are left to the reader.
#[derive(Debug, Serialize, ToSchema)]
pub struct Stats {
    /// Public jams still to come or running.
    pub jams_upcoming: i64,
    /// Public jams that are over, completed or not.
    pub jams_past: i64,
    /// Jams waiting for an admin's approval.
    pub jams_in_review: i64,
    /// Jams still being prepared.
    pub jams_draft: i64,
    /// Jams called off.
    pub jams_cancelled: i64,
    /// Dancer pages, merged and deleted ones left out.
    pub dancers: i64,
    /// Dancer pages whose Instagram an admin confirmed.
    pub dancers_verified: i64,
    /// Dancer pages with an Instagram handle.
    pub dancers_with_instagram: i64,
    /// Accounts with the `organizer` role.
    pub organizers: i64,
    /// Organisers whose Instagram an admin confirmed.
    pub organizers_verified: i64,
    /// All accounts.
    pub accounts: i64,
    /// Accounts created in the last 30 days.
    pub accounts_new: i64,
    /// Dancer claims waiting for review.
    pub dancer_claims_pending: i64,
    /// Organiser claims waiting for review.
    pub organizer_claims_pending: i64,
}

/// Every count of the admin overview, in one round trip.
pub async fn overview(pool: &PgPool) -> sqlx::Result<Stats> {
    sqlx::query_as!(
        Stats,
        r#"with jams as (
             select status in ('published', 'registration_closed') as public, status, ends_on
             from events where deleted_at is null
           )
           select
             (select count(*) from jams where public and ends_on >= current_date) as "jams_upcoming!",
             (select count(*) from jams
              where status = 'completed' or (public and ends_on < current_date)) as "jams_past!",
             (select count(*) from jams where status = 'in_review') as "jams_in_review!",
             (select count(*) from jams where status = 'draft') as "jams_draft!",
             (select count(*) from jams where status = 'cancelled') as "jams_cancelled!",
             count(*) as "dancers!",
             count(verified_at) as "dancers_verified!",
             count(instagram_handle) as "dancers_with_instagram!",
             (select count(*) from app_users where role = 'organizer') as "organizers!",
             (select count(*) from app_users
              where role = 'organizer' and verified_at is not null) as "organizers_verified!",
             (select count(*) from app_users) as "accounts!",
             (select count(*) from app_users
              where created_at > now() - interval '30 days') as "accounts_new!",
             (select count(*) from dancer_claims where status = 'pending') as "dancer_claims_pending!",
             (select count(*) from organizer_claims
              where status = 'pending') as "organizer_claims_pending!"
           from dancers
           where deleted_at is null and merged_into_id is null"#,
    )
    .fetch_one(pool)
    .await
}
