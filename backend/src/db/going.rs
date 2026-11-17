//! Who is going to a jam (`event_attendees`, M32).

use sqlx::{PgExecutor, PgPool};
use uuid::Uuid;

use crate::domain::dancer::DancerRef;

/// Marks `user_id` as going; saying it twice changes nothing.
pub async fn add(db: impl PgExecutor<'_>, event_id: Uuid, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "insert into event_attendees (event_id, user_id) values ($1, $2) on conflict do nothing",
        event_id,
        user_id,
    )
    .execute(db)
    .await?;
    Ok(())
}

/// Takes `user_id` off the jam's list, if it was on it.
pub async fn remove(db: impl PgExecutor<'_>, event_id: Uuid, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "delete from event_attendees where event_id = $1 and user_id = $2",
        event_id,
        user_id,
    )
    .execute(db)
    .await?;
    Ok(())
}

/// How many accounts are going, and whether `user_id` is one of them.
pub async fn count(
    db: impl PgExecutor<'_>,
    event_id: Uuid,
    user_id: Option<Uuid>,
) -> sqlx::Result<(i64, bool)> {
    let row = sqlx::query!(
        r#"select count(*) as "count!", coalesce(bool_or(user_id = $2), false) as "going!"
           from event_attendees where event_id = $1"#,
        event_id,
        user_id,
    )
    .fetch_one(db)
    .await?;
    Ok((row.count, row.going))
}

/// How many accounts are going and the verified dancer pages among them, by name, read
/// together so the two always agree: an unverified page proves nothing, so it is only counted.
pub async fn attendees(pool: &PgPool, event_id: Uuid) -> sqlx::Result<(i64, Vec<DancerRef>)> {
    let rows = sqlx::query!(
        r#"select d.id as "id?", d.dancer_name as "dancer_name?", d.country as "country?",
                  d.country2, case when d.instagram_hidden then null else d.instagram_handle end
                    as instagram_handle,
                  d.avatar_url, d.avatar
           from event_attendees a
           left join dancers d on d.user_id = a.user_id and d.verified_at is not null
                              and d.deleted_at is null and d.merged_into_id is null
           where a.event_id = $1
           order by lower(d.dancer_name), d.id"#,
        event_id,
    )
    .fetch_all(pool)
    .await?;
    let total = rows.len() as i64;
    let dancers = rows
        .into_iter()
        .filter_map(|r| {
            Some(DancerRef {
                id: r.id?,
                dancer_name: r.dancer_name?,
                country: r.country?,
                country2: r.country2,
                instagram_handle: r.instagram_handle,
                avatar_url: r.avatar_url,
                avatar: r.avatar,
                deleted: false,
            })
        })
        .collect();
    Ok((total, dancers))
}
