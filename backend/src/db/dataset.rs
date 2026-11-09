//! Rows the curated `data/` import writes inside one transaction, besides jams, battles and entries,
//! and the keys of those it wrote before.

use std::collections::BTreeMap;

use chrono::NaiveDate;
use sqlx::PgConnection;
use uuid::Uuid;

use crate::{
    dataset::{CrewRecord, DancerRecord},
    domain::{battle::StaffRole, dancer::default_look, event::EventStatus},
};

/// A dancer from `dancers.toml`, entered as a seed admin's: notable (§4 "Dancer identity").
pub async fn insert_dancer(
    conn: &mut PgConnection,
    key: &str,
    dancer: &DancerRecord,
    created_by: Uuid,
) -> sqlx::Result<Uuid> {
    let id = Uuid::now_v7();
    // Set before any entry, so the battles' suggestion (which fills only empty looks) defers to it.
    let avatar_parts = dancer.look.and_then(|look| default_look(id, look));
    sqlx::query!(
        "insert into dancers (id, data_key, dancer_name, aliases, country, country2, avatar_parts, source, notable, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, 'seed', true, $8)",
        id,
        key,
        dancer.name,
        &dancer.aliases,
        dancer.country,
        dancer.country2,
        avatar_parts,
        created_by,
    )
    .execute(conn)
    .await?;
    Ok(id)
}

/// A crew from `crews.toml`, under its key.
pub async fn insert_crew(
    conn: &mut PgConnection,
    key: &str,
    crew: &CrewRecord,
) -> sqlx::Result<Uuid> {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into crews (id, data_key, name, country) values ($1, $2, $3, $4)",
        id,
        key,
        crew.name,
        crew.country,
    )
    .execute(conn)
    .await?;
    Ok(id)
}

/// The dancer is in the crew, since an unknown date.
pub async fn add_membership(
    conn: &mut PgConnection,
    dancer_id: Uuid,
    crew_id: Uuid,
) -> sqlx::Result<()> {
    sqlx::query!(
        "insert into crew_memberships (dancer_id, crew_id) values ($1, $2) on conflict do nothing",
        dancer_id,
        crew_id,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// The dancer judged, DJed or MCed the jam.
pub async fn add_staff(
    conn: &mut PgConnection,
    event_id: Uuid,
    dancer_id: Uuid,
    role: StaffRole,
) -> sqlx::Result<()> {
    sqlx::query!(
        "insert into event_staff (event_id, dancer_id, role) values ($1, $2, $3) on conflict do nothing",
        event_id,
        dancer_id,
        role as StaffRole,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// The ids of the dancers an earlier import wrote, by key; a merged one's is the page it went into.
pub async fn dancer_keys(conn: &mut PgConnection) -> sqlx::Result<BTreeMap<String, Uuid>> {
    let rows = sqlx::query!(
        r#"select data_key as "key!", coalesce(merged_into_id, id) as "id!"
           from dancers where data_key is not null"#
    )
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(|r| (r.key, r.id)).collect())
}

/// The ids of the crews an earlier import wrote, by key.
pub async fn crew_keys(conn: &mut PgConnection) -> sqlx::Result<BTreeMap<String, Uuid>> {
    let rows =
        sqlx::query!(r#"select data_key as "key!", id from crews where data_key is not null"#)
            .fetch_all(conn)
            .await?;
    Ok(rows.into_iter().map(|r| (r.key, r.id)).collect())
}

/// The keys of the jams an earlier import wrote.
pub async fn event_keys(conn: &mut PgConnection) -> sqlx::Result<Vec<String>> {
    sqlx::query_scalar!(r#"select data_key as "key!" from events where data_key is not null"#)
        .fetch_all(conn)
        .await
}

/// The name and first day of every live jam without a key: written by hand, or imported before
/// jams had keys.
pub async fn unkeyed_events(conn: &mut PgConnection) -> sqlx::Result<Vec<(String, NaiveDate)>> {
    let rows = sqlx::query!(
        "select name, starts_on from events where data_key is null and deleted_at is null"
    )
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(|r| (r.name, r.starts_on)).collect())
}

/// Publishes a jam the import just wrote, under its key: it arrives past or announced, not via review.
pub async fn publish_imported(
    conn: &mut PgConnection,
    event_id: Uuid,
    key: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        "update events set status = 'published', data_key = $2 where id = $1",
        event_id,
        key,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Sets a jam's status directly: the seed's invented jams arrive in any status, not via review.
pub async fn set_status(
    conn: &mut PgConnection,
    event_id: Uuid,
    status: EventStatus,
) -> sqlx::Result<()> {
    sqlx::query!(
        "update events set status = $2 where id = $1",
        event_id,
        status as EventStatus,
    )
    .execute(conn)
    .await?;
    Ok(())
}
