//! `app_users` queries.

use std::collections::HashMap;

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::{
    auth::google::Profile,
    domain::user::{Account, AccountView, Role, User},
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

/// An account with what logging in checks.
#[derive(Debug)]
pub struct Credentials {
    /// The account.
    pub user: User,
    /// Its Argon2 hash; `None` for a Google-only account.
    pub password_hash: Option<String>,
    /// Whether its owner proved the email (a code, or Google).
    pub email_verified: bool,
}

/// The account for `email` (case-insensitive) with its credentials.
pub async fn find_credentials(pool: &PgPool, email: &str) -> sqlx::Result<Option<Credentials>> {
    let row = sqlx::query!(
        r#"select id, email::text as "email!", display_name, role as "role: Role", password_hash,
                  email_verified_at is not null as "email_verified!"
           from app_users where email = $1::text::citext"#,
        email,
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| Credentials {
        user: User {
            id: r.id,
            email: r.email,
            display_name: r.display_name,
            role: r.role,
        },
        password_hash: r.password_hash,
        email_verified: r.email_verified,
    }))
}

/// Marks the account's email as proved by a mailed code.
pub async fn mark_email_verified(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<()> {
    // A Google account linked while nobody had proved the address may be someone else's, so
    // the code's reader takes the account alone: `link_google` the other way round.
    sqlx::query!(
        "update app_users
         set google_sub = case when email_verified_at is null then null else google_sub end,
             email_verified_at = coalesce(email_verified_at, now())
         where id = $1",
        id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Replaces the account's password.
pub async fn set_password(
    conn: &mut PgConnection,
    id: Uuid,
    password_hash: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        "update app_users set password_hash = $2 where id = $1",
        id,
        password_hash,
    )
    .execute(conn)
    .await?;
    Ok(())
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

/// Turns a plain `user` into an `organizer`; higher roles are left alone.
pub async fn promote_to_organizer(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "update app_users set role = 'organizer' where id = $1 and role = 'user'",
        id
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Locks an account, so two role changes on it run one after the other.
pub async fn find_for_update(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<User>> {
    sqlx::query_as!(
        User,
        r#"select id, email::text as "email!", display_name, role as "role: Role"
           from app_users where id = $1 for update"#,
        id,
    )
    .fetch_optional(conn)
    .await
}

/// Sets an account's role; `None` gives `organizer` when it owns a jam, else `user`.
pub async fn set_role(conn: &mut PgConnection, id: Uuid, role: Option<Role>) -> sqlx::Result<User> {
    sqlx::query_as!(
        User,
        r#"update app_users set role = coalesce($2, case
             when exists(select 1 from events where organizer_id = $1 and deleted_at is null)
             then 'organizer'::user_role else 'user'::user_role end)
           where id = $1
           returning id, email::text as "email!", display_name, role as "role: Role""#,
        id,
        role as Option<Role>,
    )
    .fetch_one(conn)
    .await
}

/// One page of the admin Accounts tab; `email` keeps the addresses that contain it (M31).
pub async fn accounts(
    pool: &PgPool,
    view: AccountView,
    email: Option<&str>,
    window: super::Window,
) -> sqlx::Result<Vec<Account>> {
    let view = match view {
        AccountView::LastSeen => "last_seen",
        AccountView::New => "new",
        AccountView::Unconfirmed => "unconfirmed",
        AccountView::Organizers => "organizers",
        AccountView::Team => "team",
    };
    // The team's jams are left out: they are not their enterer's own.
    sqlx::query_as!(
        Account,
        r#"select u.id, u.email::text as "email!", u.display_name, u.role as "role: Role",
                  u.created_at, u.email_verified_at, u.last_seen_at,
                  count(e.id) filter (where e.status not in ('draft', 'in_review')) as "public_jams!",
                  count(e.id) filter (where e.status in ('draft', 'in_review')) as "private_jams!"
           from app_users u
           left join events e
             on e.organizer_id = u.id and e.deleted_at is null and not e.entered_by_team
           where case $1
                   when 'last_seen' then u.last_seen_at is not null
                   when 'new' then u.email_verified_at is not null
                   when 'unconfirmed' then u.email_verified_at is null
                   when 'team' then u.role >= 'seed_admin'
                   else true
                 end
             and ($2::text is null or u.email::text ilike $2)
           group by u.id
           having $1 <> 'organizers' or count(e.id) > 0
           order by case $1
                      when 'last_seen' then u.last_seen_at
                      when 'new' then u.email_verified_at
                      else u.created_at
                    end desc, u.id desc
           limit $3 offset $4"#,
        view,
        email.map(super::contains_pattern),
        window.limit,
        window.offset,
    )
    .fetch_all(pool)
    .await
}

/// Whether the user already owns a verified dancer page.
pub async fn owns_dancer(pool: &PgPool, id: Uuid) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(select 1 from dancers where user_id = $1 and deleted_at is null) as "owns!""#,
        id,
    )
    .fetch_one(pool)
    .await
}

/// The login emails of `ids`, keyed by account id.
pub async fn emails(pool: &PgPool, ids: &[Uuid]) -> sqlx::Result<HashMap<Uuid, String>> {
    let rows = sqlx::query!(
        r#"select id, email::text as "email!" from app_users where id = any($1)"#,
        ids,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.id, r.email)).collect())
}
