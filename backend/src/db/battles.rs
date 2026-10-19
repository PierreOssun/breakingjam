//! `battles`, `entries` and `entry_members` queries.

use std::collections::HashMap;

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::{
    battle::{
        Battle, BattleAge, BattleFields, BattleFormat, BattleGender, BracketStage, CrewName, Entry,
        EntryFields, EntryStatus,
    },
    dancer::DancerRef,
};

/// A jam's battles in display order.
pub async fn list(pool: &PgPool, event_id: Uuid) -> sqlx::Result<Vec<Battle>> {
    sqlx::query_as!(
        Battle,
        r#"select id, event_id, name, format as "format: BattleFormat", team_size,
                  gender as "gender: BattleGender", age as "age: BattleAge", age_min, age_max,
                  bracket_size, max_entries, prize_currency, prize_first, prize_second,
                  prize_third, position, starts_at, created_at, updated_at
           from battles where event_id = $1 order by position, id"#,
        event_id,
    )
    .fetch_all(pool)
    .await
}

/// The battles of several jams by jam, each jam's in display order.
pub async fn of_events(
    pool: &PgPool,
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
    .fetch_all(pool)
    .await?;
    let mut by_event = HashMap::<Uuid, Vec<Battle>>::new();
    for battle in battles {
        by_event.entry(battle.event_id).or_default().push(battle);
    }
    Ok(by_event)
}

/// One battle.
pub async fn find(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Battle>> {
    sqlx::query_as!(
        Battle,
        r#"select id, event_id, name, format as "format: BattleFormat", team_size,
                  gender as "gender: BattleGender", age as "age: BattleAge", age_min, age_max,
                  bracket_size, max_entries, prize_currency, prize_first, prize_second,
                  prize_third, position, starts_at, created_at, updated_at
           from battles where id = $1"#,
        id,
    )
    .fetch_optional(pool)
    .await
}

/// Adds a battle at the end of the jam's list.
pub async fn insert(
    conn: &mut PgConnection,
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
    .fetch_one(conn)
    .await
}

/// Replaces a battle's fields; its position is changed only by `reorder`.
pub async fn update(
    pool: &PgPool,
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
    .fetch_one(pool)
    .await
}

/// Deletes a battle with its entries (cascade).
pub async fn delete(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("delete from battles where id = $1", id)
        .execute(pool)
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

/// Entries of a battle, oldest first, with members and crew.
pub async fn entries(pool: &PgPool, battle_id: Uuid) -> sqlx::Result<Vec<Entry>> {
    fetch_entries(pool, Some(battle_id), None).await
}

/// One entry, with members and crew.
pub async fn find_entry(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Entry>> {
    Ok(fetch_entries(pool, None, Some(id)).await?.pop())
}

async fn fetch_entries(
    pool: &PgPool,
    battle_id: Option<Uuid>,
    entry_id: Option<Uuid>,
) -> sqlx::Result<Vec<Entry>> {
    let rows = sqlx::query!(
        r#"select e.id, e.battle_id, e.team_name, e.status as "status: EntryStatus",
                  e.reached as "reached: BracketStage", e.final_rank, e.video_url,
                  e.video_offset_seconds, e.created_at, e.updated_at,
                  c.id as "crew_id?", c.name as "crew_name?"
           from entries e left join crews c on c.id = e.crew_id
           where ($1::uuid is null or e.battle_id = $1) and ($2::uuid is null or e.id = $2)
           order by e.created_at, e.id"#,
        battle_id,
        entry_id,
    )
    .fetch_all(pool)
    .await?;
    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut members = members(pool, &ids).await?;
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

async fn members(pool: &PgPool, entry_ids: &[Uuid]) -> sqlx::Result<HashMap<Uuid, Vec<DancerRef>>> {
    let rows = sqlx::query!(
        "select m.entry_id, d.id, d.dancer_name, d.country, d.country2, d.instagram_handle,
                d.avatar_url, d.avatar_parts
         from entry_members m join dancers d on d.id = m.dancer_id
         where m.entry_id = any($1)
         order by lower(d.dancer_name), d.id",
        entry_ids,
    )
    .fetch_all(pool)
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
        });
    }
    Ok(by_entry)
}

/// Entries other than `except_entry` that still count toward `max_entries` (not withdrawn).
pub async fn active_entry_count(
    pool: &PgPool,
    battle_id: Uuid,
    except_entry: Option<Uuid>,
) -> sqlx::Result<i64> {
    sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries
           where battle_id = $1 and status <> 'withdrawn' and ($2::uuid is null or id <> $2)"#,
        battle_id,
        except_entry,
    )
    .fetch_one(pool)
    .await
}

/// Whether any of `dancer_ids` already competes in another active entry of the battle.
pub async fn already_entered(
    pool: &PgPool,
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
    .fetch_one(pool)
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
