//! `dancers` queries; soft-deleted and merged rows are hidden from lists.

use std::collections::HashMap;

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::{
    battle::{BattleAge, BattleFormat, BattleGender, BracketStage, EntryStatus, StaffRole},
    crew::CrewRef,
    dancer::{
        BattleRef, Dancer, DancerFields, DancerRef, DancerSource, DancerSummary, EventRef,
        FieldChange, Participation, default_look,
    },
    event::EventStatus,
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

/// A dancer that is not soft-deleted.
pub async fn find(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Dancer>> {
    sqlx::query_as!(
        Dancer,
        r#"select id, user_id, dancer_name, aliases, real_name, country, country2, city, bio,
                  instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                  avatar_parts,
                  created_by, merged_into_id, created_at, updated_at
           from dancers where id = $1 and deleted_at is null"#,
        id,
    )
    .fetch_optional(pool)
    .await
}

/// The live dancer page an approved claim linked to the account `user_id`, if any.
pub async fn of_user(pool: &PgPool, user_id: Uuid) -> sqlx::Result<Option<DancerRef>> {
    sqlx::query_as!(
        DancerRef,
        "select id, dancer_name, country, country2, instagram_handle, avatar_url, avatar_parts
         from dancers where user_id = $1 and deleted_at is null and merged_into_id is null",
        user_id,
    )
    .fetch_optional(pool)
    .await
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
             (id, dancer_name, aliases, real_name, country, country2, city, bio,
              instagram_handle, source, notable, created_by, avatar_parts)
           values ($1, btrim($2), array(select btrim(a) from unnest($3::text[]) a),
                   nullif(btrim($4), ''), $5, $6, nullif(btrim($7), ''), nullif(btrim($8), ''),
                   nullif(lower(ltrim(btrim($9), '@')), ''), $10, $11, $12, nullif(btrim($13), ''))
           returning id, user_id, dancer_name, aliases, real_name, country, country2, city, bio,
                     instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                  avatar_parts,
                     created_by, merged_into_id, created_at, updated_at"#,
        Uuid::now_v7(),
        fields.dancer_name,
        &fields.aliases,
        fields.real_name,
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
             real_name = nullif(btrim($4), ''), country = $5, country2 = $6,
             city = nullif(btrim($7), ''), bio = nullif(btrim($8), ''),
             instagram_handle = nullif(lower(ltrim(btrim($9), '@')), ''),
             avatar_parts = nullif(btrim($10), '')
           where id = $1 and deleted_at is null
           returning id, user_id, dancer_name, aliases, real_name, country, country2, city, bio,
                     instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                  avatar_parts,
                     created_by, merged_into_id, created_at, updated_at"#,
        id,
        fields.dancer_name,
        &fields.aliases,
        fields.real_name,
        fields.country,
        fields.country2,
        fields.city,
        fields.bio,
        fields.instagram_handle,
        fields.avatar_parts,
    )
    .fetch_one(conn)
    .await
}

/// A dancer that is neither soft-deleted nor merged away: the only kind that can be written.
pub async fn find_live(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Dancer>> {
    Ok(find(pool, id).await?.filter(|d| d.merged_into_id.is_none()))
}

/// Locks a dancer row for the rest of the transaction.
pub async fn find_for_update(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Dancer>> {
    sqlx::query_as!(
        Dancer,
        r#"select id, user_id, dancer_name, aliases, real_name, country, country2, city, bio,
                  instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                  avatar_parts,
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

/// Moves everything that points at `loser` to `survivor` and turns `loser` into a redirect (§4 "Merge").
pub async fn merge(
    conn: &mut PgConnection,
    loser: &Dancer,
    survivor: &Dancer,
    aliases: &[String],
) -> sqlx::Result<()> {
    let (from, into) = (loser.id, survivor.id);
    move_entry_members(conn, from, into).await?;
    move_staff(conn, from, into).await?;
    move_memberships(conn, from, into).await?;
    move_claims(conn, from, into, survivor.verified_at.is_some()).await?;
    redirect(conn, loser, into, aliases).await
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

/// Memberships move unless the survivor has the same crew and `since`; leftovers are dropped.
async fn move_memberships(conn: &mut PgConnection, from: Uuid, into: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "update crew_memberships m set dancer_id = $2
         where dancer_id = $1
           and not exists (select 1 from crew_memberships t
                           where t.dancer_id = $2 and t.crew_id = m.crew_id
                             and t.since is not distinct from m.since)",
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

/// Claims move; a user with pending claims on both keeps one, and claims on a verified survivor are moot.
async fn move_claims(
    conn: &mut PgConnection,
    from: Uuid,
    into: Uuid,
    survivor_verified: bool,
) -> sqlx::Result<()> {
    sqlx::query!(
        "update dancer_claims set status = 'rejected', reviewed_at = now()
         where dancer_id = $1 and status = 'pending'
           and ($3 or user_id in (select user_id from dancer_claims
                                  where dancer_id = $2 and status = 'pending'))",
        from,
        into,
        survivor_verified,
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

/// The loser (and anything already redirected to it) points at the survivor, which takes the aliases and a missing handle.
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
    // The loser no longer holds the handle (the unique index skips merged rows), so it can move.
    sqlx::query!(
        "update dancers set aliases = $2, instagram_handle = coalesce(instagram_handle, $3)
         where id = $1",
        into,
        aliases,
        loser.instagram_handle,
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
                  e.starts_on as "starts_on!", e.ends_on as "ends_on!", e.city as "city!",
                  e.country as "country!", e.status as "status!: EventStatus",
                  e.starts_on >= current_date as "upcoming!",
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
                  e.starts_on >= current_date,
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
            upcoming: r.upcoming,
        })
        .collect())
}

/// How many of `ids` are live dancers (not deleted, not merged).
pub async fn count_live(pool: &PgPool, ids: &[Uuid]) -> sqlx::Result<i64> {
    sqlx::query_scalar!(
        r#"select count(*) as "count!" from dancers
           where id = any($1) and deleted_at is null and merged_into_id is null"#,
        ids,
    )
    .fetch_one(pool)
    .await
}

/// Gives the dancers nobody has drawn yet the look a bgirl or bboy battle suggests; a mixed
/// battle suggests none.
pub async fn suggest_looks(
    conn: &mut PgConnection,
    dancer_ids: &[Uuid],
    gender: BattleGender,
) -> sqlx::Result<()> {
    let (ids, looks): (Vec<Uuid>, Vec<String>) = dancer_ids
        .iter()
        .filter_map(|&id| Some((id, default_look(id, gender)?)))
        .unzip();
    if ids.is_empty() {
        return Ok(());
    }
    sqlx::query!(
        "update dancers set avatar_parts = suggested.look
         from unnest($1::uuid[], $2::text[]) as suggested(id, look)
         where dancers.id = suggested.id and dancers.avatar_parts is null",
        &ids,
        &looks,
    )
    .execute(conn)
    .await?;
    Ok(())
}
