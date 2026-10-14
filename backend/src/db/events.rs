//! `events` queries; soft-deleted rows are invisible everywhere.

use chrono::NaiveDate;
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::{
    battle::{StaffAssignment, StaffMember, StaffRole},
    dancer::DancerRef,
    event::{Event, EventFields, EventStatus},
};

/// Filters for `list`; `None` means "any".
pub struct ListFilter<'a> {
    /// Jams in any of these statuses.
    pub statuses: &'a [EventStatus],
    /// ISO 3166-1 alpha-2.
    pub country: Option<&'a str>,
    /// Jams still running on or after this date.
    pub from: Option<NaiveDate>,
    /// Jams starting on or before this date.
    pub to: Option<NaiveDate>,
    /// Jams owned by this account.
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
    /// City.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Latitude.
    pub lat: f64,
    /// Longitude.
    pub lng: f64,
}

/// Inserts a draft jam; optional text fields are trimmed and `""` becomes null.
pub async fn insert(
    conn: &mut PgConnection,
    id: Uuid,
    organizer_id: Uuid,
    fields: &EventFields,
) -> sqlx::Result<Event> {
    sqlx::query_as!(
        Event,
        r#"insert into events
             (id, organizer_id, slug, name, description, starts_on, ends_on, timezone,
              venue_name, address, city, country, lat, lng, registration_url, instagram_url)
           values ($1, $2, $3, btrim($4), nullif(btrim($5), ''), $6, $7, $8,
                   nullif(btrim($9), ''), nullif(btrim($10), ''), btrim($11), $12, $13, $14,
                   nullif(btrim($15), ''), nullif(btrim($16), ''))
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     starts_on, ends_on, timezone, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, created_at, updated_at"#,
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
    )
    .fetch_one(conn)
    .await
}

/// Replaces the editable fields; the slug stays stable so shared links keep working.
pub async fn update(pool: &PgPool, id: Uuid, fields: &EventFields) -> sqlx::Result<Event> {
    sqlx::query_as!(
        Event,
        r#"update events set
             name = btrim($2), description = nullif(btrim($3), ''), starts_on = $4, ends_on = $5,
             timezone = $6, venue_name = nullif(btrim($7), ''), address = nullif(btrim($8), ''),
             city = btrim($9), country = $10, lat = $11, lng = $12,
             registration_url = nullif(btrim($13), ''), instagram_url = nullif(btrim($14), '')
           where id = $1 and deleted_at is null
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     starts_on, ends_on, timezone, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, created_at, updated_at"#,
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
    )
    .fetch_one(pool)
    .await
}

/// A jam by uuid or by slug.
pub async fn find(pool: &PgPool, id_or_slug: &str) -> sqlx::Result<Option<Event>> {
    let id = Uuid::try_parse(id_or_slug).ok();
    sqlx::query_as!(
        Event,
        r#"select id, organizer_id, name, slug, description, status as "status: EventStatus",
                  starts_on, ends_on, timezone, venue_name, address, city, country, lat, lng,
                  registration_url, instagram_url, created_at, updated_at
           from events
           where deleted_at is null and (id = $1 or slug = $2)"#,
        id,
        id_or_slug,
    )
    .fetch_optional(pool)
    .await
}

/// Jams matching `filter`, ordered by `(starts_on, id)`.
pub async fn list(pool: &PgPool, filter: &ListFilter<'_>) -> sqlx::Result<Vec<Event>> {
    let (after_date, after_id) = filter.after.unzip();
    sqlx::query_as!(
        Event,
        r#"select id, organizer_id, name, slug, description, status as "status: EventStatus",
                  starts_on, ends_on, timezone, venue_name, address, city, country, lat, lng,
                  registration_url, instagram_url, created_at, updated_at
           from events
           where deleted_at is null
             and status = any($1)
             and ($2::text is null or country = $2)
             and ($3::date is null or ends_on >= $3)
             and ($4::date is null or starts_on <= $4)
             and ($5::uuid is null or organizer_id = $5)
             and ($6::date is null or (starts_on, id) > ($6, $7))
           order by starts_on, id
           limit $8"#,
        filter.statuses as &[EventStatus],
        filter.country,
        filter.from,
        filter.to,
        filter.organizer_id,
        after_date,
        after_id,
        filter.limit,
    )
    .fetch_all(pool)
    .await
}

/// Points for the world map: jams in `statuses` that have coordinates.
pub async fn map_points(pool: &PgPool, statuses: &[EventStatus]) -> sqlx::Result<Vec<MapPoint>> {
    sqlx::query_as!(
        MapPoint,
        r#"select id, name, slug, starts_on, city, country, lat as "lat!", lng as "lng!"
           from events
           where deleted_at is null and status = any($1) and lat is not null and lng is not null
           order by starts_on, id"#,
        statuses as &[EventStatus],
    )
    .fetch_all(pool)
    .await
}

/// Moves a jam from `from` to `to`; `None` when the status changed under the caller.
pub async fn set_status(
    pool: &PgPool,
    id: Uuid,
    from: EventStatus,
    to: EventStatus,
) -> sqlx::Result<Option<Event>> {
    // Compare-and-set: two concurrent transitions must not both win.
    sqlx::query_as!(
        Event,
        r#"update events set status = $3
           where id = $1 and status = $2 and deleted_at is null
           returning id, organizer_id, name, slug, description, status as "status: EventStatus",
                     starts_on, ends_on, timezone, venue_name, address, city, country, lat, lng,
                     registration_url, instagram_url, created_at, updated_at"#,
        id,
        from as EventStatus,
        to as EventStatus,
    )
    .fetch_optional(pool)
    .await
}

/// Soft-deletes a jam.
pub async fn soft_delete(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "update events set deleted_at = now() where id = $1 and deleted_at is null",
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// A jam's staff, by role then name.
pub async fn staff(pool: &PgPool, event_id: Uuid) -> sqlx::Result<Vec<StaffMember>> {
    let rows = sqlx::query!(
        r#"select s.role as "role: StaffRole", d.id, d.dancer_name, d.country, d.country2,
                  d.instagram_handle
           from event_staff s join dancers d on d.id = s.dancer_id
           where s.event_id = $1
           order by s.role, lower(d.dancer_name), d.id"#,
        event_id,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| StaffMember {
            role: r.role,
            dancer: DancerRef {
                id: r.id,
                dancer_name: r.dancer_name,
                country: r.country,
                country2: r.country2,
                instagram_handle: r.instagram_handle,
            },
        })
        .collect())
}

/// Replaces a jam's whole staff list.
pub async fn replace_staff(
    conn: &mut PgConnection,
    event_id: Uuid,
    staff: &[StaffAssignment],
) -> sqlx::Result<()> {
    let (dancers, roles): (Vec<Uuid>, Vec<StaffRole>) =
        staff.iter().map(|s| (s.dancer_id, s.role)).unzip();
    sqlx::query!("delete from event_staff where event_id = $1", event_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!(
        "insert into event_staff (event_id, dancer_id, role)
         select $1, d, r from unnest($2::uuid[], $3::staff_role[]) as t(d, r)",
        event_id,
        &dancers,
        &roles as &[StaffRole],
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
