//! Counts for the admin overview and the landing page.

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

/// What the landing page counts; public jams are announced or completed, never cancelled.
#[derive(Debug, Serialize, ToSchema)]
pub struct SiteStats {
    /// Countries with at least one public jam.
    pub countries: i64,
    /// Battles of public jams, past and upcoming.
    pub battles: i64,
    /// Dancer pages, merged and deleted ones left out.
    pub dancers: i64,
    /// Battles per country, the busiest first.
    pub battles_by_country: Vec<CountryBattles>,
}

/// How many battles a country's public jams hold.
#[derive(Debug, Serialize, ToSchema)]
pub struct CountryBattles {
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Battles of its public jams.
    pub battles: i64,
}

/// The landing page counts, in two round trips.
pub async fn site(pool: &PgPool) -> sqlx::Result<SiteStats> {
    let totals = sqlx::query!(
        r#"with public_jams as (
             select id, country from events
             where deleted_at is null
               and status in ('published', 'registration_closed', 'completed')
           )
           select
             (select count(distinct country) from public_jams) as "countries!",
             (select count(*) from battles where event_id in (select id from public_jams))
               as "battles!",
             (select count(*) from dancers
              where deleted_at is null and merged_into_id is null) as "dancers!""#,
    )
    .fetch_one(pool)
    .await?;
    let battles_by_country = sqlx::query_as!(
        CountryBattles,
        r#"select e.country, count(*) as "battles!"
           from battles b join events e on e.id = b.event_id
           where e.deleted_at is null
             and e.status in ('published', 'registration_closed', 'completed')
           group by e.country
           order by 2 desc, e.country"#,
    )
    .fetch_all(pool)
    .await?;
    Ok(SiteStats {
        countries: totals.countries,
        battles: totals.battles,
        dancers: totals.dancers,
        battles_by_country,
    })
}
