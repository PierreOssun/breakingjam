//! `crews` and `crew_memberships` queries; soft-deleted crews are invisible.

use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::crew::{Crew, CrewFields, Member};

/// Crews whose name contains `query`, by name.
pub async fn search(
    pool: &PgPool,
    query: Option<&str>,
    page: (i64, i64),
) -> sqlx::Result<Vec<Crew>> {
    let (limit, offset) = page;
    let pattern = query.map(super::contains_pattern);
    sqlx::query_as!(
        Crew,
        "select id, name, country, city, instagram_handle, created_at, updated_at
         from crews
         where deleted_at is null and ($1::text is null or name ilike $1)
         order by lower(name), id
         limit $2 offset $3",
        pattern,
        limit,
        offset,
    )
    .fetch_all(pool)
    .await
}

/// A crew that is not soft-deleted.
pub async fn find(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<Crew>> {
    sqlx::query_as!(
        Crew,
        "select id, name, country, city, instagram_handle, created_at, updated_at
         from crews where id = $1 and deleted_at is null",
        id,
    )
    .fetch_optional(pool)
    .await
}

/// Inserts a crew; text is trimmed, blanks become null, the handle is stored lower case without `@`.
pub async fn insert(pool: &PgPool, fields: &CrewFields) -> sqlx::Result<Crew> {
    sqlx::query_as!(
        Crew,
        "insert into crews (id, name, country, city, instagram_handle)
         values ($1, btrim($2), $3, nullif(btrim($4), ''), nullif(lower(ltrim(btrim($5), '@')), ''))
         returning id, name, country, city, instagram_handle, created_at, updated_at",
        Uuid::now_v7(),
        fields.name,
        fields.country,
        fields.city,
        fields.instagram_handle,
    )
    .fetch_one(pool)
    .await
}

/// Replaces the editable fields with the same normalisation as `insert`.
pub async fn update(pool: &PgPool, id: Uuid, fields: &CrewFields) -> sqlx::Result<Crew> {
    sqlx::query_as!(
        Crew,
        "update crews set
           name = btrim($2), country = $3, city = nullif(btrim($4), ''),
           instagram_handle = nullif(lower(ltrim(btrim($5), '@')), '')
         where id = $1 and deleted_at is null
         returning id, name, country, city, instagram_handle, created_at, updated_at",
        id,
        fields.name,
        fields.country,
        fields.city,
        fields.instagram_handle,
    )
    .fetch_one(pool)
    .await
}

/// Soft-deletes a crew, memberships staying for history; `false` when there was none to delete.
pub async fn soft_delete(pool: &PgPool, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query!(
        "update crews set deleted_at = now() where id = $1 and deleted_at is null",
        id
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// Current members (no `until`) of a crew, by name.
pub async fn current_members(pool: &PgPool, crew_id: Uuid) -> sqlx::Result<Vec<Member>> {
    sqlx::query_as!(
        Member,
        "select d.id as dancer_id, d.dancer_name, d.country, m.since
         from crew_memberships m join dancers d on d.id = m.dancer_id
         where m.crew_id = $1 and m.until is null
           and d.deleted_at is null and d.merged_into_id is null
         order by lower(d.dancer_name), d.id",
        crew_id,
    )
    .fetch_all(pool)
    .await
}

/// Whether the dancer is a current member of the crew.
pub async fn is_current_member(
    pool: &PgPool,
    crew_id: Uuid,
    dancer_id: Uuid,
) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(
             select 1 from crew_memberships
             where crew_id = $1 and dancer_id = $2 and until is null
           ) as "exists!""#,
        crew_id,
        dancer_id,
    )
    .fetch_one(pool)
    .await
}

/// Adds a membership starting `since` (null = unknown).
pub async fn add_member(
    pool: &PgPool,
    crew_id: Uuid,
    dancer_id: Uuid,
    since: Option<NaiveDate>,
) -> sqlx::Result<()> {
    sqlx::query!(
        "insert into crew_memberships (dancer_id, crew_id, since) values ($1, $2, $3)",
        dancer_id,
        crew_id,
        since,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Ends the current membership today; `false` when there was none.
pub async fn end_membership(pool: &PgPool, crew_id: Uuid, dancer_id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query!(
        "update crew_memberships set until = current_date
         where crew_id = $1 and dancer_id = $2 and until is null",
        crew_id,
        dancer_id,
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
