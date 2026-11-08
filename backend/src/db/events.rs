//! `events` queries; soft-deleted rows are invisible everywhere.

use chrono::NaiveDate;
use sqlx::{PgConnection, PgExecutor, PgPool};
use uuid::Uuid;

use crate::domain::event::{Event, EventFields, EventStatus, Phase, UploadedFlyer};

/// Filters for `list`; `None` means "any".
pub struct ListFilter {
    /// Jams in this status.
    pub status: Option<EventStatus>,
    /// Jams owned by this account; the only list that includes drafts and jams in review.
    pub organizer_id: Option<Uuid>,
    /// Keyset cursor: rows strictly after `(starts_on, id)`.
    pub after: Option<(NaiveDate, Uuid)>,
    /// Maximum rows returned.
    pub limit: i64,
}

/// One map point.
pub struct MapPoint {
    /// Jam id.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Public URL segment.
    pub slug: String,
    /// First day.
    pub starts_on: NaiveDate,
    /// Last day.
    pub ends_on: NaiveDate,
    /// `published` or `registration_closed`.
    pub status: EventStatus,
    /// Upcoming, live or past.
    pub phase: Phase,
    /// City.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Latitude.
    pub lat: f64,
    /// Longitude.
    pub lng: f64,
    /// The uploaded flyer at card size; null means the generated one.
    pub flyer_card_url: Option<String>,
    /// Whether a battle of this live or past jam has a video (M28).
    pub has_videos: bool,
}

/// Inserts a draft jam; optional text fields are trimmed and `""` becomes null.
pub async fn insert(
    db: impl PgExecutor<'_>,
    id: Uuid,
    organizer_id: Uuid,
    fields: &EventFields,
) -> sqlx::Result<Event> {
    sqlx::query_as!(
        Event,
        r#"insert into events
             (id, organizer_id, slug, name, description, starts_on, ends_on, timezone,
              venue_name, address, city, country, lat, lng, registration_url, instagram_url,
              website_url, contact_email, opens_at, closes_at)
           values ($1, $2, $3, btrim($4), nullif(btrim($5), ''), $6, $7, $8,
                   nullif(btrim($9), ''), nullif(btrim($10), ''), nullif(btrim($11), ''), $12,
                   $13, $14, nullif(btrim($15), ''), nullif(btrim($16), ''),
                   nullif(btrim($17), ''), nullif(btrim($18), ''), $19, $20)
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at"#,
        id,
        organizer_id,
        crate::domain::event::slug(&fields.name, id),
        fields.name,
        fields.description,
        fields.starts_on,
        fields.ends_on,
        fields.timezone,
        fields.venue_name,
        fields.address,
        fields.city,
        fields.country,
        fields.lat,
        fields.lng,
        fields.registration_url,
        fields.instagram_url,
        fields.website_url,
        fields.contact_email,
        fields.opens_at,
        fields.closes_at,
    )
    .fetch_one(db)
    .await
}

/// Replaces the editable fields; the slug stays stable so shared links keep working.
pub async fn update(
    db: impl PgExecutor<'_>,
    id: Uuid,
    fields: &EventFields,
) -> sqlx::Result<Event> {
    sqlx::query_as!(
        Event,
        r#"update events set
             name = btrim($2), description = nullif(btrim($3), ''), starts_on = $4, ends_on = $5,
             timezone = $6, venue_name = nullif(btrim($7), ''), address = nullif(btrim($8), ''),
             city = nullif(btrim($9), ''), country = $10, lat = $11, lng = $12,
             registration_url = nullif(btrim($13), ''), instagram_url = nullif(btrim($14), ''),
             website_url = nullif(btrim($15), ''), contact_email = nullif(btrim($16), ''),
             opens_at = $17, closes_at = $18
           where id = $1 and deleted_at is null
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at"#,
        id,
        fields.name,
        fields.description,
        fields.starts_on,
        fields.ends_on,
        fields.timezone,
        fields.venue_name,
        fields.address,
        fields.city,
        fields.country,
        fields.lat,
        fields.lng,
        fields.registration_url,
        fields.instagram_url,
        fields.website_url,
        fields.contact_email,
        fields.opens_at,
        fields.closes_at,
    )
    .fetch_one(db)
    .await
}

/// A jam by uuid or by slug.
pub async fn find(db: impl PgExecutor<'_>, id_or_slug: &str) -> sqlx::Result<Option<Event>> {
    let id = Uuid::try_parse(id_or_slug).ok();
    sqlx::query_as!(
        Event,
        r#"select id, organizer_id, name, slug, description, status as "status: EventStatus",
                  jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                  registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at
           from events
           where deleted_at is null and (id = $1 or slug = $2)"#,
        id,
        id_or_slug,
    )
    .fetch_optional(db)
    .await
}

/// Jams matching `filter`, ordered by `(starts_on, id)`.
pub async fn list(pool: &PgPool, filter: &ListFilter) -> sqlx::Result<Vec<Event>> {
    let (after_date, after_id) = filter.after.unzip();
    sqlx::query_as!(
        Event,
        r#"select id, organizer_id, name, slug, description, status as "status: EventStatus",
                  jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                  registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at
           from events
           where deleted_at is null
             and ($1::event_status is null or status = $1)
             and ($2::uuid is null or organizer_id = $2)
             and ($2::uuid is not null or status not in ('draft', 'in_review'))
             and ($3::date is null or (starts_on, id) > ($3, $4))
           order by starts_on, id
           limit $5"#,
        filter.status as Option<EventStatus>,
        filter.organizer_id,
        after_date,
        after_id,
        filter.limit,
    )
    .fetch_all(pool)
    .await
}

/// Points for the world map: announced jams with coordinates, upcoming to past, never cancelled ones.
pub async fn map_points(pool: &PgPool) -> sqlx::Result<Vec<MapPoint>> {
    // The API keeps a jam's place once it is past draft; the filter makes that true here too.
    sqlx::query_as!(
        MapPoint,
        r#"select id, name, slug, starts_on, ends_on, status as "status: EventStatus",
                  jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", city as "city!", country as "country!", lat as "lat!", lng as "lng!",
                  flyer_card_url,
                  -- An upcoming jam never shows it, whatever was entered early (M28).
                  jam_phase(starts_on, ends_on, timezone) <> 'upcoming' and (exists (
                    select 1 from battles b join entries e on e.battle_id = b.id
                    where b.event_id = events.id and e.video_url is not null
                      and e.status <> 'withdrawn'
                  ) or exists (
                    select 1 from battles b join battle_matches m on m.battle_id = b.id
                    where b.event_id = events.id and m.video_url is not null
                  )) as "has_videos!"
           from events
           where deleted_at is null and status in ('published', 'registration_closed')
             and city is not null and country is not null and lat is not null and lng is not null
           order by starts_on, id"#,
    )
    .fetch_all(pool)
    .await
}

/// Moves a jam from `from` to `to` with `note` as its review note (an admin's reason for
/// sending it back; null clears it); `None` when the status changed under the caller.
pub async fn set_status(
    db: impl PgExecutor<'_>,
    id: Uuid,
    from: EventStatus,
    to: EventStatus,
    note: Option<&str>,
) -> sqlx::Result<Option<Event>> {
    // Compare-and-set: two concurrent transitions must not both win.
    sqlx::query_as!(
        Event,
        r#"update events set status = $3, review_note = $4
           where id = $1 and status = $2 and deleted_at is null
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at"#,
        id,
        from as EventStatus,
        to as EventStatus,
        note,
    )
    .fetch_optional(db)
    .await
}

/// Jams waiting for review, the soonest first since they are the most urgent.
pub async fn in_review(pool: &PgPool, window: super::Window) -> sqlx::Result<Vec<Event>> {
    sqlx::query_as!(
        Event,
        r#"select id, organizer_id, name, slug, description, status as "status: EventStatus",
                  jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                  registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at
           from events
           where deleted_at is null and status = 'in_review'
           order by starts_on, id
           limit $1 offset $2"#,
        window.limit,
        window.offset,
    )
    .fetch_all(pool)
    .await
}

/// Sets the uploaded flyer, or clears it with `None` to go back to the generated one; returns
/// the jam and the flyer this replaced.
pub async fn set_flyer(
    pool: &PgPool,
    id: Uuid,
    flyer: Option<&UploadedFlyer>,
) -> sqlx::Result<(Event, Option<UploadedFlyer>)> {
    let (url, card_url) = flyer.map(|f| (&f.url, &f.card_url)).unzip();
    let mut tx = pool.begin().await?;
    // Read under the row lock: of two concurrent uploads, each learns the flyer it replaced.
    let old = sqlx::query!(
        "select flyer_url, flyer_card_url from events
         where id = $1 and deleted_at is null for update",
        id
    )
    .fetch_one(&mut *tx)
    .await?;
    let event = sqlx::query_as!(
        Event,
        r#"update events set flyer_url = $2, flyer_card_url = $3
           where id = $1 and deleted_at is null
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     jam_phase(starts_on, ends_on, timezone) as "phase!: Phase", starts_on, ends_on, timezone, opens_at, closes_at, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, website_url, contact_email, flyer_url, flyer_card_url, review_note, created_at, updated_at"#,
        id,
        url,
        card_url,
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((event, uploaded(old.flyer_url, old.flyer_card_url)))
}

/// Soft-deletes a jam; returns its uploaded flyer, whose images must go with it.
pub async fn soft_delete(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<UploadedFlyer>> {
    let row = sqlx::query!(
        "update events set deleted_at = now() where id = $1 and deleted_at is null
         returning flyer_url, flyer_card_url",
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|r| uploaded(r.flyer_url, r.flyer_card_url)))
}

/// The uploaded flyer of the two columns, which are set together or not at all.
fn uploaded(url: Option<String>, card_url: Option<String>) -> Option<UploadedFlyer> {
    Some(UploadedFlyer {
        url: url?,
        card_url: card_url?,
    })
}

/// Locks a jam for the rest of the transaction and reads it, so writes that check it (its days,
/// its battles, its staff) see it as it stays until they commit.
pub async fn find_locked(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Event>> {
    sqlx::query!(
        "select id from events where id = $1 and deleted_at is null for no key update",
        id
    )
    .fetch_optional(&mut *conn)
    .await?;
    find(conn, &id.to_string()).await
}

/// Where a jam of these days would be in time, by its own calendar.
pub async fn phase_of(
    db: impl PgExecutor<'_>,
    starts_on: NaiveDate,
    ends_on: NaiveDate,
    timezone: &str,
) -> sqlx::Result<Phase> {
    sqlx::query_scalar!(
        r#"select jam_phase($1, $2, $3) as "phase!: Phase""#,
        starts_on,
        ends_on,
        timezone
    )
    .fetch_one(db)
    .await
}

/// Whether Postgres knows `name` as a timezone, so `jam_phase` can read the jam's calendar.
pub async fn known_timezone(db: impl PgExecutor<'_>, name: &str) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(select 1 from pg_timezone_names where name = $1) as "known!""#,
        name
    )
    .fetch_one(db)
    .await
}
