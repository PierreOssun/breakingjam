//! `battles`, `entries`, `entry_members`, `battle_matches` and `event_staff` queries.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use sqlx::{PgConnection, PgExecutor, PgPool};
use uuid::Uuid;

use crate::domain::{
    battle::{
        Battle, BattleAge, BattleFields, BattleFormat, BattleGender, BracketStage, CrewName, Entry,
        EntryFields, EntryStatus, Match, MatchFields, MatchRound, Placing, StaffAssignment,
        StaffMember, StaffRole,
    },
    dancer::DancerRef,
};

/// A jam's battles in display order.
pub async fn list(db: impl PgExecutor<'_>, event_id: Uuid) -> sqlx::Result<Vec<Battle>> {
    Ok(of_events(db, &[event_id])
        .await?
        .remove(&event_id)
        .unwrap_or_default())
}

/// The battles of several jams by jam, each jam's in display order.
pub async fn of_events(
    db: impl PgExecutor<'_>,
    event_ids: &[Uuid],
) -> sqlx::Result<HashMap<Uuid, Vec<Battle>>> {
    let battles = sqlx::query_as!(
        Battle,
        r#"select id, event_id, name, format as "format: BattleFormat", team_size,
                  gender as "gender: BattleGender", age as "age: BattleAge", age_min, age_max,
                  bracket_size, max_entries, prize_currency, prize_first, prize_second,
                  prize_third, position, starts_at, created_at, updated_at
           from battles where event_id = any($1) order by event_id, position, id"#,
        event_ids,
    )
    .fetch_all(db)
    .await?;
    let mut by_event = HashMap::<Uuid, Vec<Battle>>::new();
    for battle in battles {
        by_event.entry(battle.event_id).or_default().push(battle);
    }
    Ok(by_event)
}

/// One battle.
pub async fn find(db: impl PgExecutor<'_>, id: Uuid) -> sqlx::Result<Option<Battle>> {
    sqlx::query_as!(
        Battle,
        r#"select id, event_id, name, format as "format: BattleFormat", team_size,
                  gender as "gender: BattleGender", age as "age: BattleAge", age_min, age_max,
                  bracket_size, max_entries, prize_currency, prize_first, prize_second,
                  prize_third, position, starts_at, created_at, updated_at
           from battles where id = $1"#,
        id,
    )
    .fetch_optional(db)
    .await
}

/// Locks a battle for the rest of the transaction, so its entries are saved one at a time.
pub async fn lock(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("select id from battles where id = $1 for no key update", id)
        .fetch_optional(conn)
        .await?;
    Ok(())
}

/// Adds a battle at the end of the jam's list.
pub async fn insert(
    db: impl PgExecutor<'_>,
    event_id: Uuid,
    name: &str,
    fields: &BattleFields,
) -> sqlx::Result<Battle> {
    sqlx::query_as!(
        Battle,
        r#"insert into battles
             (id, event_id, name, format, team_size, gender, age, age_min, age_max,
              bracket_size, max_entries, prize_currency, prize_first, prize_second,
              prize_third, starts_at, position)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                   (select coalesce(max(position) + 1, 0) from battles where event_id = $2))
           returning id, event_id, name, format as "format: BattleFormat", team_size,
                     gender as "gender: BattleGender", age as "age: BattleAge", age_min, age_max,
                     bracket_size, max_entries, prize_currency, prize_first, prize_second,
                  prize_third, position, starts_at, created_at, updated_at"#,
        Uuid::now_v7(),
        event_id,
        name,
        fields.format as BattleFormat,
        fields.team_size,
        fields.gender as BattleGender,
        fields.age as BattleAge,
        fields.age_min,
        fields.age_max,
        fields.bracket_size,
        fields.max_entries,
        fields.prize_currency,
        fields.prize_first,
        fields.prize_second,
        fields.prize_third,
        fields.starts_at,
    )
    .fetch_one(db)
    .await
}

/// Replaces a battle's fields; its position is changed only by `reorder`.
pub async fn update(
    db: impl PgExecutor<'_>,
    id: Uuid,
    name: &str,
    fields: &BattleFields,
) -> sqlx::Result<Battle> {
    sqlx::query_as!(
        Battle,
        r#"update battles set
             name = $2, format = $3, team_size = $4, gender = $5, age = $6, age_min = $7,
             age_max = $8, bracket_size = $9, max_entries = $10, prize_currency = $11,
             prize_first = $12, prize_second = $13, prize_third = $14, starts_at = $15
           where id = $1
           returning id, event_id, name, format as "format: BattleFormat", team_size,
                     gender as "gender: BattleGender", age as "age: BattleAge", age_min, age_max,
                     bracket_size, max_entries, prize_currency, prize_first, prize_second,
                  prize_third, position, starts_at, created_at, updated_at"#,
        id,
        name,
        fields.format as BattleFormat,
        fields.team_size,
        fields.gender as BattleGender,
        fields.age as BattleAge,
        fields.age_min,
        fields.age_max,
        fields.bracket_size,
        fields.max_entries,
        fields.prize_currency,
        fields.prize_first,
        fields.prize_second,
        fields.prize_third,
        fields.starts_at,
    )
    .fetch_one(db)
    .await
}

/// Deletes a battle with its entries (cascade).
pub async fn delete(db: impl PgExecutor<'_>, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("delete from battles where id = $1", id)
        .execute(db)
        .await?;
    Ok(())
}

/// Sets `position` to each id's index in `ids`.
pub async fn reorder(pool: &PgPool, event_id: Uuid, ids: &[Uuid]) -> sqlx::Result<()> {
    sqlx::query!(
        "update battles set position = (o.ord - 1)::smallint
         from unnest($2::uuid[]) with ordinality as o(id, ord)
         where battles.id = o.id and battles.event_id = $1",
        event_id,
        ids,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// The entries of several battles by battle, oldest first, with members and crew.
pub async fn entries_of(
    conn: &mut PgConnection,
    battle_ids: &[Uuid],
) -> sqlx::Result<HashMap<Uuid, Vec<Entry>>> {
    let rows = sqlx::query_as!(
        EntryRow,
        // A subquery, not a join: the columns' nullability then comes from the table, not
        // from whichever plan Postgres picks, so `sqlx prepare --check` stays stable.
        r#"select e.id, e.battle_id, e.team_name, e.status as "status: EntryStatus",
                  e.reached as "reached: BracketStage", e.final_rank, e.video_url,
                  e.video_offset_seconds, e.created_at, e.updated_at, e.crew_id,
                  (select c.name from crews c where c.id = e.crew_id) as "crew_name?"
           from entries e
           where e.battle_id = any($1)
           order by e.created_at, e.id"#,
        battle_ids,
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut by_battle = HashMap::<Uuid, Vec<Entry>>::new();
    for entry in with_members(conn, rows).await? {
        by_battle.entry(entry.battle_id).or_default().push(entry);
    }
    Ok(by_battle)
}

/// The matches of several battles by battle, round by round from the first, in order.
pub async fn matches_of(
    conn: &mut PgConnection,
    battle_ids: &[Uuid],
) -> sqlx::Result<HashMap<Uuid, Vec<Match>>> {
    let rows = sqlx::query!(
        r#"select id, battle_id, round as "round: MatchRound", position, winner_id, loser_id,
                  video_url, video_offset_seconds
           from battle_matches
           where battle_id = any($1)
           order by round, position"#,
        battle_ids,
    )
    .fetch_all(conn)
    .await?;
    let mut by_battle = HashMap::<Uuid, Vec<Match>>::new();
    for row in rows {
        by_battle.entry(row.battle_id).or_default().push(Match {
            id: row.id,
            round: row.round,
            position: row.position,
            winner_id: row.winner_id,
            loser_id: row.loser_id,
            video_url: row.video_url,
            video_offset_seconds: row.video_offset_seconds,
        });
    }
    Ok(by_battle)
}

/// Stores one match of a battle.
pub async fn insert_match(
    conn: &mut PgConnection,
    battle_id: Uuid,
    fields: &MatchFields,
) -> sqlx::Result<()> {
    sqlx::query!(
        "insert into battle_matches
           (id, battle_id, round, position, winner_id, loser_id, video_url, video_offset_seconds)
         values ($1, $2, $3, $4, $5, $6, $7, $8)",
        Uuid::now_v7(),
        battle_id,
        fields.round as MatchRound,
        fields.position,
        fields.winner_id,
        fields.loser_id,
        fields.video_url,
        fields.video_offset_seconds,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Replaces every match of a battle.
pub async fn replace_matches(
    conn: &mut PgConnection,
    battle_id: Uuid,
    matches: &[MatchFields],
) -> sqlx::Result<()> {
    sqlx::query!("delete from battle_matches where battle_id = $1", battle_id)
        .execute(&mut *conn)
        .await?;
    for fields in matches {
        insert_match(conn, battle_id, fields).await?;
    }
    Ok(())
}

/// Sets an entry's placing as its matches decide; its video and start only when its last match
/// has a video, so one entered before the matches stays.
pub async fn set_placing(conn: &mut PgConnection, placing: &Placing) -> sqlx::Result<()> {
    sqlx::query!(
        "update entries
         set reached = $2, final_rank = $3,
             video_url = coalesce($4, video_url),
             video_offset_seconds = case when $4::text is null then video_offset_seconds else $5 end
         where id = $1",
        placing.entry_id,
        placing.reached as BracketStage,
        placing.final_rank,
        placing.video_url,
        placing.video_offset_seconds,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// One entry, with members and crew.
pub async fn find_entry(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Entry>> {
    let rows = sqlx::query_as!(
        EntryRow,
        // A subquery, not a join: the columns' nullability then comes from the table, not
        // from whichever plan Postgres picks, so `sqlx prepare --check` stays stable.
        r#"select e.id, e.battle_id, e.team_name, e.status as "status: EntryStatus",
                  e.reached as "reached: BracketStage", e.final_rank, e.video_url,
                  e.video_offset_seconds, e.created_at, e.updated_at, e.crew_id,
                  (select c.name from crews c where c.id = e.crew_id) as "crew_name?"
           from entries e
           where e.id = $1"#,
        id,
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(with_members(conn, rows).await?.pop())
}

/// An `entries` row with its crew's name, before its members are read.
struct EntryRow {
    id: Uuid,
    battle_id: Uuid,
    team_name: Option<String>,
    status: EntryStatus,
    reached: BracketStage,
    final_rank: Option<i32>,
    video_url: Option<String>,
    video_offset_seconds: Option<i32>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    crew_id: Option<Uuid>,
    crew_name: Option<String>,
}

async fn with_members(conn: &mut PgConnection, rows: Vec<EntryRow>) -> sqlx::Result<Vec<Entry>> {
    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut members = members(conn, &ids).await?;
    Ok(rows
        .into_iter()
        .map(|r| Entry {
            members: members.remove(&r.id).unwrap_or_default(),
            crew: r
                .crew_id
                .zip(r.crew_name)
                .map(|(id, name)| CrewName { id, name }),
            id: r.id,
            battle_id: r.battle_id,
            team_name: r.team_name,
            status: r.status,
            reached: r.reached,
            final_rank: r.final_rank,
            video_url: r.video_url,
            video_offset_seconds: r.video_offset_seconds,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

async fn members(
    conn: &mut PgConnection,
    entry_ids: &[Uuid],
) -> sqlx::Result<HashMap<Uuid, Vec<DancerRef>>> {
    let rows = sqlx::query!(
        r#"select m.entry_id, d.id, d.dancer_name, d.country, d.country2, d.instagram_handle,
                  d.avatar_url, d.avatar_parts, d.deleted_at is not null as "deleted!"
           from entry_members m join dancers d on d.id = m.dancer_id
           where m.entry_id = any($1)
           order by lower(d.dancer_name), d.id"#,
        entry_ids,
    )
    .fetch_all(conn)
    .await?;
    let mut by_entry = HashMap::<Uuid, Vec<DancerRef>>::new();
    for r in rows {
        by_entry.entry(r.entry_id).or_default().push(DancerRef {
            id: r.id,
            dancer_name: r.dancer_name,
            country: r.country,
            country2: r.country2,
            instagram_handle: r.instagram_handle,
            avatar_url: r.avatar_url,
            avatar_parts: r.avatar_parts,
            deleted: r.deleted,
        });
    }
    Ok(by_entry)
}

/// Entries other than `except_entry` that still count toward `max_entries` (not withdrawn).
pub async fn active_entry_count(
    db: impl PgExecutor<'_>,
    battle_id: Uuid,
    except_entry: Option<Uuid>,
) -> sqlx::Result<i64> {
    sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries
           where battle_id = $1 and status <> 'withdrawn' and ($2::uuid is null or id <> $2)"#,
        battle_id,
        except_entry,
    )
    .fetch_one(db)
    .await
}

/// Whether any of `dancer_ids` already competes in another active entry of the battle.
pub async fn already_entered(
    db: impl PgExecutor<'_>,
    battle_id: Uuid,
    dancer_ids: &[Uuid],
    except_entry: Option<Uuid>,
) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(
             select 1 from entry_members m join entries e on e.id = m.entry_id
             where e.battle_id = $1 and e.status <> 'withdrawn' and m.dancer_id = any($2)
               and ($3::uuid is null or e.id <> $3)) as "taken!""#,
        battle_id,
        dancer_ids,
        except_entry,
    )
    .fetch_one(db)
    .await
}

/// Inserts an entry (already normalised) and its members into a battle of `gender`.
pub async fn insert_entry(
    conn: &mut PgConnection,
    battle_id: Uuid,
    gender: BattleGender,
    fields: &EntryFields,
) -> sqlx::Result<Uuid> {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into entries
           (id, battle_id, team_name, crew_id, status, reached, final_rank, video_url,
            video_offset_seconds)
         values ($1, $2, nullif(btrim($3), ''), $4, $5, $6, $7, $8, $9)",
        id,
        battle_id,
        fields.team_name,
        fields.crew_id,
        fields.status as EntryStatus,
        fields.reached as BracketStage,
        fields.final_rank,
        fields.video_url,
        fields.video_offset_seconds,
    )
    .execute(&mut *conn)
    .await?;
    replace_members(conn, id, &fields.dancer_ids, gender).await?;
    Ok(id)
}

/// Replaces an entry's fields and members; `gender` is its battle's.
pub async fn update_entry(
    conn: &mut PgConnection,
    id: Uuid,
    gender: BattleGender,
    fields: &EntryFields,
) -> sqlx::Result<()> {
    sqlx::query!(
        "update entries set
           team_name = nullif(btrim($2), ''), crew_id = $3, status = $4, reached = $5,
           final_rank = $6, video_url = $7, video_offset_seconds = $8
         where id = $1",
        id,
        fields.team_name,
        fields.crew_id,
        fields.status as EntryStatus,
        fields.reached as BracketStage,
        fields.final_rank,
        fields.video_url,
        fields.video_offset_seconds,
    )
    .execute(&mut *conn)
    .await?;
    replace_members(conn, id, &fields.dancer_ids, gender).await
}

async fn replace_members(
    conn: &mut PgConnection,
    entry_id: Uuid,
    dancer_ids: &[Uuid],
    gender: BattleGender,
) -> sqlx::Result<()> {
    sqlx::query!("delete from entry_members where entry_id = $1", entry_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query!(
        "insert into entry_members (entry_id, dancer_id) select $1, unnest($2::uuid[])",
        entry_id,
        dancer_ids,
    )
    .execute(&mut *conn)
    .await?;
    super::dancers::suggest_looks(conn, dancer_ids, gender).await
}

/// Deletes an entry and its members.
pub async fn delete_entry(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("delete from entries where id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}

/// The dancers on a jam's staff, in any role.
pub async fn staff_ids(conn: &mut PgConnection, event_id: Uuid) -> sqlx::Result<Vec<Uuid>> {
    sqlx::query_scalar!(
        "select distinct dancer_id from event_staff where event_id = $1",
        event_id
    )
    .fetch_all(conn)
    .await
}

/// A jam's staff, by role then name.
pub async fn staff(pool: &PgPool, event_id: Uuid) -> sqlx::Result<Vec<StaffMember>> {
    let rows = sqlx::query!(
        r#"select s.role as "role: StaffRole", d.id, d.dancer_name, d.country, d.country2,
                  d.instagram_handle, d.avatar_url, d.avatar_parts,
                  d.deleted_at is not null as "deleted!"
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
                avatar_url: r.avatar_url,
                avatar_parts: r.avatar_parts,
                deleted: r.deleted,
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
