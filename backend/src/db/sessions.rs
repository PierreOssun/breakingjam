//! `sessions` queries.

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::user::{Role, User};

/// Creates a session with a random (v4) id, valid for `ttl_days`.
pub async fn create(pool: &PgPool, user_id: Uuid, ttl_days: i32) -> sqlx::Result<Uuid> {
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into sessions (id, user_id, expires_at)
         values ($1, $2, now() + make_interval(days => $3))",
        id,
        user_id,
        ttl_days,
    )
    .execute(pool)
    .await?;
    Ok(id)
}

/// The user behind an unexpired session.
pub async fn find_user(pool: &PgPool, id: Uuid) -> sqlx::Result<Option<User>> {
    sqlx::query_as!(
        User,
        r#"select u.id, u.email::text as "email!", u.display_name, u.role as "role: Role"
           from sessions s join app_users u on u.id = s.user_id
           where s.id = $1 and s.expires_at > now()"#,
        id,
    )
    .fetch_optional(pool)
    .await
}

/// Pushes the expiry to `ttl_days` from now.
pub async fn extend(pool: &PgPool, id: Uuid, ttl_days: i32) -> sqlx::Result<()> {
    sqlx::query!(
        "update sessions set expires_at = now() + make_interval(days => $2) where id = $1",
        id,
        ttl_days,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Deletes one session; unknown ids are ignored.
pub async fn delete(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("delete from sessions where id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Deletes every session of a user.
pub async fn delete_for_user(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("delete from sessions where user_id = $1", user_id)
        .execute(conn)
        .await?;
    Ok(())
}
