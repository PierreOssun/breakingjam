//! `dancers` queries; soft-deleted and merged rows are hidden from lists.

use std::collections::HashMap;

use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::{
    battle::{BattleAge, BattleFormat, BattleGender, BracketStage, EntryStatus, StaffRole},
    crew::CrewRef,
    dancer::{Dancer, DancerFields, DancerSource, DancerSummary},
    event::EventStatus,
};

/// One appearance of a dancer at a public jam, as competitor (battle set) or staff (role set).
#[derive(Debug, Clone)]
pub struct Participation {
    pub event_id: Uuid,
    pub event_name: String,
    pub slug: String,
    pub starts_on: NaiveDate,
    pub ends_on: NaiveDate,
    pub city: String,
    pub country: String,
    pub status: EventStatus,
    pub upcoming: bool,
    pub battle_id: Option<Uuid>,
    pub battle_name: Option<String>,
    pub format: Option<BattleFormat>,
    pub team_size: Option<i16>,
    pub gender: Option<BattleGender>,
    pub age: Option<BattleAge>,
    pub staff_role: Option<StaffRole>,
    pub entry_status: Option<EntryStatus>,
    pub reached: Option<BracketStage>,
    pub final_rank: Option<i32>,
    pub video_url: Option<String>,
}

/// Search by name, alias or handle (case-insensitive substring), notable dancers first.
pub async fn search(
    pool: &PgPool,
    query: Option<&str>,
    country: Option<&str>,
    page: (i64, i64),
) -> sqlx::Result<Vec<DancerSummary>> {
    let (limit, offset) = page;
    let pattern = query.map(super::contains_pattern);
    let rows = sqlx::query!(
        r#"select id, dancer_name, aliases, country, country2, city, instagram_handle,
                  verified_at is not null as "verified!"
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
        country,
        limit,
        offset,
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
                  created_by, created_at, updated_at
           from dancers where id = $1 and deleted_at is null"#,
        id,
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
              instagram_handle, source, notable, created_by)
           values ($1, btrim($2), array(select btrim(a) from unnest($3::text[]) a),
                   nullif(btrim($4), ''), $5, $6, nullif(btrim($7), ''), nullif(btrim($8), ''),
                   nullif(lower(ltrim(btrim($9), '@')), ''), $10, $11, $12)
           returning id, user_id, dancer_name, aliases, real_name, country, country2, city, bio,
                     instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                     created_by, created_at, updated_at"#,
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
    )
    .fetch_one(pool)
    .await
}

/// Replaces the editable fields with the same normalisation as `insert`.
pub async fn update(pool: &PgPool, id: Uuid, fields: &DancerFields) -> sqlx::Result<Dancer> {
    sqlx::query_as!(
        Dancer,
        r#"update dancers set
             dancer_name = btrim($2), aliases = array(select btrim(a) from unnest($3::text[]) a),
             real_name = nullif(btrim($4), ''), country = $5, country2 = $6,
             city = nullif(btrim($7), ''), bio = nullif(btrim($8), ''),
             instagram_handle = nullif(lower(ltrim(btrim($9), '@')), '')
           where id = $1 and deleted_at is null
           returning id, user_id, dancer_name, aliases, real_name, country, country2, city, bio,
                     instagram_handle, source as "source: DancerSource", verified_at, avatar_url,
                     created_by, created_at, updated_at"#,
        id,
        fields.dancer_name,
        &fields.aliases,
        fields.real_name,
        fields.country,
        fields.country2,
        fields.city,
        fields.bio,
        fields.instagram_handle,
    )
    .fetch_one(pool)
    .await
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

/// Every public jam (not draft, not deleted) where the dancer competed or was staff.
pub async fn participations(pool: &PgPool, dancer_id: Uuid) -> sqlx::Result<Vec<Participation>> {
    sqlx::query_as!(
        Participation,
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
           where m.dancer_id = $1 and e.deleted_at is null and e.status <> 'draft'
           union all
           select e.id, e.name, e.slug, e.starts_on, e.ends_on, e.city, e.country, e.status,
                  e.starts_on >= current_date,
                  null::uuid, null::text, null::battle_format, null::smallint,
                  null::battle_gender, null::battle_age, s.role,
                  null::entry_status, null::bracket_stage, null::int, null::text
           from event_staff s
           join events e on e.id = s.event_id
           where s.dancer_id = $1 and e.deleted_at is null and e.status <> 'draft'
           order by 4, 1"#,
        dancer_id,
    )
    .fetch_all(pool)
    .await
}
