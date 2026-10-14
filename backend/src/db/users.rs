//! `app_users` queries.

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::{
    auth::google::Profile,
    domain::user::{Role, User},
};

/// Inserts a password account with the default `user` role.
pub async fn insert_with_password(
    pool: &PgPool,
    email: &str,
    display_name: &str,
    password_hash: &str,
) -> sqlx::Result<User> {
    sqlx::query_as!(
        User,
        r#"insert into app_users (id, email, display_name, password_hash)
           values ($1, $2, $3, $4)
           returning id, email::text as "email!", display_name, role as "role: Role""#,
        Uuid::now_v7(),
        email,
        display_name,
        password_hash,
    )
    .fetch_one(pool)
    .await
}

/// The account for `email` (case-insensitive) and its password hash, if any.
pub async fn find_with_password(
    pool: &PgPool,
    email: &str,
) -> sqlx::Result<Option<(User, Option<String>)>> {
    let row = sqlx::query!(
        r#"select id, email::text as "email!", display_name, role as "role: Role", password_hash
           from app_users where email = $1::text::citext"#,
        email,
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| {
        let user = User {
            id: r.id,
            email: r.email,
            display_name: r.display_name,
            role: r.role,
        };
        (user, r.password_hash)
    }))
}

/// The account linked to a Google subject id.
pub async fn find_by_google_sub(conn: &mut PgConnection, sub: &str) -> sqlx::Result<Option<User>> {
    sqlx::query_as!(
        User,
        r#"select id, email::text as "email!", display_name, role as "role: Role"
           from app_users where google_sub = $1"#,
        sub,
    )
    .fetch_optional(conn)
    .await
}

/// The account for `email` and whether that email was already verified, locked for update.
pub async fn find_by_email_for_update(
    conn: &mut PgConnection,
    email: &str,
) -> sqlx::Result<Option<(User, bool)>> {
    let row = sqlx::query!(
        r#"select id, email::text as "email!", display_name, role as "role: Role",
                  email_verified_at is not null as "verified!"
           from app_users where email = $1::text::citext
           for update"#,
        email,
    )
    .fetch_optional(conn)
    .await?;
    Ok(row.map(|r| {
        let user = User {
            id: r.id,
            email: r.email,
            display_name: r.display_name,
            role: r.role,
        };
        (user, r.verified)
    }))
}

/// Links a Google account and marks the email verified.
pub async fn link_google(conn: &mut PgConnection, id: Uuid, sub: &str) -> sqlx::Result<()> {
    // An unverified email may have been registered by someone else to pre-hijack the
    // account, so its password stops working once Google proves who owns the address.
    sqlx::query!(
        "update app_users
         set google_sub = $2,
             password_hash = case when email_verified_at is null then null else password_hash end,
             email_verified_at = coalesce(email_verified_at, now())
         where id = $1",
        id,
        sub,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Inserts a Google-only account; the email counts as verified only if Google says so.
pub async fn insert_with_google(
    conn: &mut PgConnection,
    profile: &Profile,
    display_name: &str,
) -> sqlx::Result<User> {
    // An unverified Google email left marked verified would let its holder keep sessions
    // on the account after the real owner links a verified one (see `link_google`).
    sqlx::query_as!(
        User,
        r#"insert into app_users (id, email, display_name, google_sub, email_verified_at)
           values ($1, $2, $3, $4, case when $5 then now() end)
           returning id, email::text as "email!", display_name, role as "role: Role""#,
        Uuid::now_v7(),
        profile.email,
        display_name,
        profile.sub,
        profile.email_verified,
    )
    .fetch_one(conn)
    .await
}
