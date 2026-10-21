//! Rows the curated `data/` import writes inside one transaction, besides jams, battles and entries.

use sqlx::PgConnection;
use uuid::Uuid;

use crate::{
    dataset::{CrewRecord, DancerRecord},
    domain::{battle::StaffRole, dancer::default_look, event::EventStatus},
};

/// A dancer from `dancers.toml`, entered as a seed admin's: notable (§4 "Dancer identity").
pub async fn insert_dancer(
    conn: &mut PgConnection,
    dancer: &DancerRecord,
    created_by: Uuid,
) -> sqlx::Result<Uuid> {
    let id = Uuid::now_v7();
    // Set before any entry, so the battles' suggestion (which fills only empty looks) defers to it.
    let avatar_parts = dancer.look.and_then(|look| default_look(id, look));
    sqlx::query!(
        "insert into dancers (id, dancer_name, aliases, country, country2, avatar_parts, source, notable, created_by)
         values ($1, $2, $3, $4, $5, $6, 'seed', true, $7)",
        id,
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

/// A crew from `crews.toml`.
pub async fn insert_crew(conn: &mut PgConnection, crew: &CrewRecord) -> sqlx::Result<Uuid> {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into crews (id, name, country) values ($1, $2, $3)",
        id,
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

/// Sets a jam's status directly: imported jams arrive already past or announced, not via review.
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
