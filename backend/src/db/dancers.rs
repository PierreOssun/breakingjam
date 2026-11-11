//! `dancers` queries; soft-deleted and merged rows are hidden from lists.

use std::collections::HashMap;

use sqlx::{PgConnection, PgExecutor, PgPool};
use uuid::Uuid;

use crate::domain::{
    battle::{BattleAge, BattleFormat, BattleGender, BracketStage, EntryStatus, StaffRole},
    crew::CrewRef,
    dancer::{
        BattleRef, Dancer, DancerFields, DancerRef, DancerSource, DancerSummary, DancerTitle,
        EventRef, FieldChange, OwnPage, Participation, merged_aliases,
    },
    event::{EventStatus, Phase},
};

/// What `search` narrows to; each `None` matches everyone.
#[derive(Debug)]
pub struct DancerFilter<'a> {
    /// Substring of the name, an alias or the handle.
    pub query: Option<&'a str>,
    /// The first or second flag.
    pub country: Option<&'a str>,
}

/// Search by name, alias or handle (case-insensitive substring), notable dancers first.
pub async fn search(
    pool: &PgPool,
    filter: &DancerFilter<'_>,
    window: super::Window,
) -> sqlx::Result<Vec<DancerSummary>> {
    let pattern = filter.query.map(super::contains_pattern);
    let rows = sqlx::query!(
        r#"select id, dancer_name, aliases, country, country2, city, instagram_handle,
                  verified_at is not null as "verified!", avatar_url, avatar_parts
           from dancers
           where deleted_at is null and merged_into_id is null
             and ($1::text is null
                  or dancer_name ilike $1
                  or instagram_handle ilike $1
                  or exists (select 1 from unnest(aliases) a where a ilike $1))
             and ($2::text is null or country = $2 or country2 = $2)
           order by notable desc, lower(dancer_name), id
           limit $3 offset $4"#,
        pattern,
        filter.country,
        window.limit,
        window.offset,
    )
    .fetch_all(pool)
    .await?;

    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut crews = current_crews(pool, &ids).await?;
    Ok(rows
        .into_iter()
        .map(|r| DancerSummary {
            crews: crews.remove(&r.id).unwrap_or_default(),
            id: r.id,
            dancer_name: r.dancer_name,
            aliases: r.aliases,
            country: r.country,
            country2: r.country2,
            city: r.city,
            instagram_handle: r.instagram_handle,
            verified: r.verified,
            avatar_url: r.avatar_url,
            avatar_parts: r.avatar_parts,
        })
        .collect())
}

/// Current crews (no `until`) of each dancer, by dancer id.
pub async fn current_crews(
    pool: &PgPool,
    dancer_ids: &[Uuid],
) -> sqlx::Result<HashMap<Uuid, Vec<CrewRef>>> {
    let rows = sqlx::query!(
        "select m.dancer_id, c.id, c.name, m.since
         from crew_memberships m join crews c on c.id = m.crew_id
         where m.dancer_id = any($1) and m.until is null and c.deleted_at is null
         order by lower(c.name)",
        dancer_ids,
    )
    .fetch_all(pool)
    .await?;
    let mut by_dancer = HashMap::<Uuid, Vec<CrewRef>>::new();
    for r in rows {
        by_dancer.entry(r.dancer_id).or_default().push(CrewRef {
            id: r.id,
            name: r.name,
            since: r.since,
        });
    }
    Ok(by_dancer)
}

/// The id of the dancer the curated-data import wrote for `key` (`data/dancers.toml`).
pub async fn id_by_key(db: impl PgExecutor<'_>, key: &str) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar!("select id from dancers where data_key = $1", key)
        .fetch_optional(db)
        .await
}

/// A dancer that is not soft-deleted.
pub async fn find(db: impl PgExecutor<'_>, id: Uuid) -> sqlx::Result<Option<Dancer>> {
    sqlx::query_as!(
        Dancer,
        r#"select id, user_id, dancer_name, aliases, country, country2, city, bio,
                  instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                  avatar_parts, titles as "titles: Vec<DancerTitle>",
                  created_by, merged_into_id, created_at, updated_at
           from dancers where id = $1 and deleted_at is null"#,
        id,
    )
    .fetch_optional(db)
    .await
}

/// The account's own live page: the one an approved claim linked to it, else the one it made
/// for itself (or what that was merged into), as long as nobody else owns that.
pub async fn own_page(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Option<OwnPage>> {
    // Two branches, so each finds its rows through an index: the claimed page by `user_id`,
    // the page made for oneself by `created_by`.
    let row = sqlx::query!(
        r#"select id as "id!", dancer_name as "dancer_name!", country as "country!",
                  country2, instagram_handle, avatar_url, avatar_parts, verified as "verified!"
           from (select p.id, p.dancer_name, p.country, p.country2, p.instagram_handle,
                        p.avatar_url, p.avatar_parts, true as verified
                 from dancers p
                 where p.user_id = $1 and p.deleted_at is null and p.merged_into_id is null
                 union all
                 select p.id, p.dancer_name, p.country, p.country2, p.instagram_handle,
                        p.avatar_url, p.avatar_parts, false
                 from dancers mine
                 join dancers p on p.id = coalesce(mine.merged_into_id, mine.id)
                 where mine.created_by = $1 and mine.source = 'self' and mine.deleted_at is null
                   and p.user_id is null and p.deleted_at is null and p.merged_into_id is null
                ) own
           -- A page the account owns wins over one still waiting for its claim.
           order by verified desc
           limit 1"#,
        user_id,
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| OwnPage {
        dancer: DancerRef {
            id: r.id,
            dancer_name: r.dancer_name,
            country: r.country,
            country2: r.country2,
            instagram_handle: r.instagram_handle,
            avatar_url: r.avatar_url,
            avatar_parts: r.avatar_parts,
            deleted: false,
        },
        verified: r.verified,
    }))
}

/// Inserts a dancer; text is trimmed, blanks become null, the handle is stored lower case without `@`.
pub async fn insert(
    pool: &PgPool,
    fields: &DancerFields,
    source: DancerSource,
    created_by: Uuid,
) -> sqlx::Result<Dancer> {
    sqlx::query_as!(
        Dancer,
        r#"insert into dancers
             (id, dancer_name, aliases, country, country2, city, bio,
              instagram_handle, source, notable, created_by, avatar_parts, titles)
           values ($1, btrim($2), array(select btrim(a) from unnest($3::text[]) a),
                   $4, $5, nullif(btrim($6), ''), nullif(btrim($7), ''),
                   nullif(lower(ltrim(btrim($8), '@')), ''), $9, $10, $11, nullif(btrim($12), ''),
                   array(select distinct t from unnest($13::dancer_title[]) t order by t))
           returning id, user_id, dancer_name, aliases, country, country2, city, bio,
                     instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                     avatar_parts, titles as "titles: Vec<DancerTitle>",
                     created_by, merged_into_id, created_at, updated_at"#,
        Uuid::now_v7(),
        fields.dancer_name,
        &fields.aliases,
        fields.country,
        fields.country2,
        fields.city,
        fields.bio,
        fields.instagram_handle,
        source as DancerSource,
        // §4: seeded dancers are the notable ones; it only affects search ranking.
        source == DancerSource::Seed,
        created_by,
        fields.avatar_parts,
        fields.titles.as_deref().unwrap_or_default() as &[DancerTitle],
    )
    .fetch_one(pool)
    .await
}

/// Replaces the editable fields with the same normalisation as `insert`.
pub async fn update(
    conn: &mut PgConnection,
    id: Uuid,
    fields: &DancerFields,
) -> sqlx::Result<Dancer> {
    sqlx::query_as!(
        Dancer,
        r#"update dancers set
             dancer_name = btrim($2), aliases = array(select btrim(a) from unnest($3::text[]) a),
             country = $4, country2 = $5,
             city = nullif(btrim($6), ''), bio = nullif(btrim($7), ''),
             instagram_handle = nullif(lower(ltrim(btrim($8), '@')), ''),
             avatar_parts = nullif(btrim($9), ''),
             -- Absent titles keep the stored ones; the enum's order, without repeats.
             titles = case when $10::dancer_title[] is null then titles
                           else array(select distinct t from unnest($10) t order by t) end
           where id = $1 and deleted_at is null
           returning id, user_id, dancer_name, aliases, country, country2, city, bio,
                     instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                     avatar_parts, titles as "titles: Vec<DancerTitle>",
                     created_by, merged_into_id, created_at, updated_at"#,
        id,
        fields.dancer_name,
        &fields.aliases,
        fields.country,
        fields.country2,
        fields.city,
        fields.bio,
        fields.instagram_handle,
        fields.avatar_parts,
        fields.titles.as_deref() as Option<&[DancerTitle]>,
    )
    .fetch_one(conn)
    .await
}

/// A dancer that is neither soft-deleted nor merged away: the only kind that can be written.
pub async fn find_live(db: impl PgExecutor<'_>, id: Uuid) -> sqlx::Result<Option<Dancer>> {
    Ok(find(db, id).await?.filter(|d| d.merged_into_id.is_none()))
}

/// Locks a dancer row for the rest of the transaction.
pub async fn find_for_update(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Dancer>> {
    sqlx::query_as!(
        Dancer,
        r#"select id, user_id, dancer_name, aliases, country, country2, city, bio,
                  instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                  avatar_parts, titles as "titles: Vec<DancerTitle>",
                  created_by, merged_into_id, created_at, updated_at
           from dancers where id = $1 and deleted_at is null
           for update"#,
        id,
    )
    .fetch_optional(conn)
    .await
}

/// Appends to the edit audit log (§4 `dancer_edits`).
pub async fn log_edits(
    conn: &mut PgConnection,
    dancer_id: Uuid,
    user_id: Uuid,
    changes: &[FieldChange],
) -> sqlx::Result<()> {
    let ids: Vec<Uuid> = changes.iter().map(|_| Uuid::now_v7()).collect();
    let fields: Vec<&str> = changes.iter().map(|(field, ..)| *field).collect();
    let old_values: Vec<Option<&str>> = changes.iter().map(|(_, old, _)| old.as_deref()).collect();
    let new_values: Vec<Option<&str>> = changes.iter().map(|(_, _, new)| new.as_deref()).collect();
    sqlx::query!(
        "insert into dancer_edits (id, dancer_id, user_id, field, old_value, new_value)
         select i, $1, $2, f, o, n
         from unnest($3::uuid[], $4::text[], $5::text[], $6::text[]) as t(i, f, o, n)",
        dancer_id,
        user_id,
        &ids,
        &fields as &[&str],
        &old_values as &[Option<&str>],
        &new_values as &[Option<&str>],
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Moves everything that points at `loser` to `survivor` and turns `loser` into a redirect
/// (§4 "Merge"), as `admin` decided; returns the survivor's aliases, now with the loser's names.
pub async fn merge(
    conn: &mut PgConnection,
    loser: &Dancer,
    survivor: &Dancer,
    admin: Uuid,
) -> sqlx::Result<Vec<String>> {
    let (from, into) = (loser.id, survivor.id);
    let aliases = merged_aliases(survivor, loser);
    move_entry_members(conn, from, into).await?;
    move_staff(conn, from, into).await?;
    move_memberships(conn, from, into).await?;
    move_claims(conn, from, survivor, admin).await?;
    redirect(conn, loser, into, &aliases).await?;
    Ok(aliases)
}

/// A battle where both dancers are in different active entries, as "Jam · Battle": merging
/// them would put one dancer in two entries of it.
pub async fn shared_battle(
    conn: &mut PgConnection,
    one: Uuid,
    other: Uuid,
) -> sqlx::Result<Option<String>> {
    sqlx::query_scalar!(
        r#"select e.name || ' · ' || b.name as "name!"
           from entry_members m1
           join entries n1 on n1.id = m1.entry_id
           join entries n2 on n2.battle_id = n1.battle_id and n2.id <> n1.id
           join entry_members m2 on m2.entry_id = n2.id
           join battles b on b.id = n1.battle_id
           join events e on e.id = b.event_id
           where m1.dancer_id = $1 and m2.dancer_id = $2
             and n1.status <> 'withdrawn' and n2.status <> 'withdrawn'
           limit 1"#,
        one,
        other,
    )
    .fetch_optional(conn)
    .await
}

/// Entry rows move unless the survivor is already in that entry; leftovers are dropped.
async fn move_entry_members(conn: &mut PgConnection, from: Uuid, into: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "update entry_members set dancer_id = $2
         where dancer_id = $1
           and entry_id not in (select entry_id from entry_members where dancer_id = $2)",
        from,
        into,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!("delete from entry_members where dancer_id = $1", from)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Staff rows move unless the survivor already holds that role at the jam; leftovers are dropped.
async fn move_staff(conn: &mut PgConnection, from: Uuid, into: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "update event_staff s set dancer_id = $2
         where dancer_id = $1
           and not exists (select 1 from event_staff t
                           where t.dancer_id = $2 and t.event_id = s.event_id and t.role = s.role)",
        from,
        into,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!("delete from event_staff where dancer_id = $1", from)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Memberships move unless the survivor has the same crew with the same `since`, or both are
/// current members (one current membership per crew); leftovers are dropped.
async fn move_memberships(conn: &mut PgConnection, from: Uuid, into: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "update crew_memberships m set dancer_id = $2
         where dancer_id = $1
           and not exists (select 1 from crew_memberships t
                           where t.dancer_id = $2 and t.crew_id = m.crew_id
                             and (t.since is not distinct from m.since
                                  or (t.until is null and m.until is null)))",
        from,
        into,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!("delete from crew_memberships where dancer_id = $1", from)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Claims move; a user with pending claims on both keeps one, and claims on a verified survivor
/// are moot: `admin`, who merges, rejects them.
async fn move_claims(
    conn: &mut PgConnection,
    from: Uuid,
    survivor: &Dancer,
    admin: Uuid,
) -> sqlx::Result<()> {
    let into = survivor.id;
    sqlx::query!(
        "update dancer_claims set status = 'rejected', reviewed_by = $4, reviewed_at = now()
         where dancer_id = $1 and status = 'pending'
           and ($3 or user_id in (select user_id from dancer_claims
                                  where dancer_id = $2 and status = 'pending'))",
        from,
        into,
        survivor.verified_at.is_some(),
        admin,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query!(
        "update dancer_claims set dancer_id = $2 where dancer_id = $1",
        from,
        into
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// The loser (and anything already redirected to it) points at the survivor, which takes the aliases, a missing handle and, while unclaimed, missing titles.
async fn redirect(
    conn: &mut PgConnection,
    loser: &Dancer,
    into: Uuid,
    aliases: &[String],
) -> sqlx::Result<()> {
    // Earlier redirects to the loser now point at the survivor, so there are no chains.
    sqlx::query!(
        "update dancers set merged_into_id = $2 where merged_into_id = $1 or id = $1",
        loser.id,
        into
    )
    .execute(&mut *conn)
    .await?;
    // The loser no longer holds the handle (the unique index skips merged rows), so it can move;
    // its titles too, when the survivor says none and has no owner to say so.
    sqlx::query!(
        "update dancers set aliases = $2, instagram_handle = coalesce(instagram_handle, $3),
                titles = case when cardinality(titles) = 0 and verified_at is null then $4
                              else titles end
         where id = $1",
        into,
        aliases,
        loser.instagram_handle,
        &loser.titles as &[DancerTitle],
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Soft-deletes a dancer; `false` when there was none to delete.
pub async fn soft_delete(pool: &PgPool, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query!(
        "update dancers set deleted_at = now() where id = $1 and deleted_at is null",
        id
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Every public jam (not draft, in review or deleted) where the dancer competed or was staff.
pub async fn participations(pool: &PgPool, dancer_id: Uuid) -> sqlx::Result<Vec<Participation>> {
    let rows = sqlx::query!(
        r#"select e.id as "event_id!", e.name as "event_name!", e.slug as "slug!",
                  e.starts_on as "starts_on!", e.ends_on as "ends_on!", e.city,
                  e.country, e.status as "status!: EventStatus",
                  jam_phase(e.starts_on, e.ends_on, e.timezone) as "phase!: Phase",
                  b.id as "battle_id?", b.name as "battle_name?",
                  b.format as "format?: BattleFormat", b.team_size as "team_size?",
                  b.gender as "gender?: BattleGender", b.age as "age?: BattleAge",
                  null::staff_role as "staff_role?: StaffRole",
                  en.status as "entry_status?: EntryStatus", en.reached as "reached?: BracketStage",
                  en.final_rank as "final_rank?", en.video_url as "video_url?"
           from entry_members m
           join entries en on en.id = m.entry_id
           join battles b on b.id = en.battle_id
           join events e on e.id = b.event_id
           where m.dancer_id = $1 and e.deleted_at is null and e.status not in ('draft', 'in_review')
           union all
           select e.id, e.name, e.slug, e.starts_on, e.ends_on, e.city, e.country, e.status,
                  jam_phase(e.starts_on, e.ends_on, e.timezone),
                  null::uuid, null::text, null::battle_format, null::smallint,
                  null::battle_gender, null::battle_age, s.role,
                  null::entry_status, null::bracket_stage, null::int, null::text
           from event_staff s
           join events e on e.id = s.event_id
           where s.dancer_id = $1 and e.deleted_at is null and e.status not in ('draft', 'in_review')
           order by 4, 1"#,
        dancer_id,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| Participation {
            event: EventRef {
                id: r.event_id,
                name: r.event_name,
                slug: r.slug,
                starts_on: r.starts_on,
                ends_on: r.ends_on,
                city: r.city,
                country: r.country,
                status: r.status,
                phase: r.phase,
            },
            battle: match (r.battle_id, r.battle_name, r.format, r.gender, r.age) {
                (Some(id), Some(name), Some(format), Some(gender), Some(age)) => Some(BattleRef {
                    id,
                    name,
                    format,
                    team_size: r.team_size,
                    gender,
                    age,
                }),
                _ => None,
            },
            role: r.staff_role.into(),
            entry_status: r.entry_status,
            reached: r.reached,
            final_rank: r.final_rank,
            video_url: r.video_url,
        })
        .collect())
}

/// Whether every one of `ids` may be referenced: live, or deleted but already in `kept`.
pub async fn usable(conn: &mut PgConnection, ids: &[Uuid], kept: &[Uuid]) -> sqlx::Result<bool> {
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from dancers
           where id = any($1) and merged_into_id is null and (deleted_at is null or id = any($2))"#,
        ids,
        kept,
    )
    .fetch_one(conn)
    .await?;
    Ok(count == ids.len() as i64)
}

/// The advisory lock merges hold; any number, as long as nothing else uses it.
const MERGE_LOCK: i64 = 0x6d65_7267_6573;

/// How a transaction stands toward merges, which run alone (ARCHITECTURE.md "Concurrency").
#[derive(Debug, Clone, Copy)]
pub enum MergeLock {
    /// A merge: waits for the writes below to finish and holds new ones off.
    Exclusive,
    /// A write to dancers or what points at them: runs beside others, never beside a merge.
    Shared,
}

/// Takes the merge lock for the rest of the transaction.
pub async fn lock_merges(conn: &mut PgConnection, mode: MergeLock) -> sqlx::Result<()> {
    match mode {
        MergeLock::Exclusive => sqlx::query!("select pg_advisory_xact_lock($1)", MERGE_LOCK),
        MergeLock::Shared => sqlx::query!("select pg_advisory_xact_lock_shared($1)", MERGE_LOCK),
    }
    .execute(conn)
    .await?;
    Ok(())
}
