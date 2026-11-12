//! `email_codes` queries: the 6-digit codes mailed to prove an address (M27).

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::user::CodePurpose;

/// Minutes a mailed code works; the emails say so in words (`mail::Message::code`).
const LIFETIME_MINUTES: i32 = 15;

/// Stores `code` as the account's live one for `purpose`, replacing the last; `false`, and
/// nothing stored, when the last went out less than a minute ago or 10 went out today.
pub async fn issue(
    pool: &PgPool,
    user_id: Uuid,
    purpose: CodePurpose,
    code: &str,
) -> sqlx::Result<bool> {
    // Without the daily cap, a code a minute is 7,200 guesses a day at someone's reset code.
    let stored = sqlx::query!(
        "insert into email_codes (user_id, purpose, code, expires_at)
         values ($1, $2, $3, now() + make_interval(mins => $4))
         on conflict (user_id, purpose) do update
           set code = excluded.code, attempts = 0, sent_at = now(),
               expires_at = excluded.expires_at,
               sends = case when email_codes.day_started_at < now() - interval '1 day'
                            then 1 else email_codes.sends + 1 end,
               day_started_at = case when email_codes.day_started_at < now() - interval '1 day'
                                     then now() else email_codes.day_started_at end
           where email_codes.sent_at < now() - interval '1 minute'
             and (email_codes.sends < 10
                  or email_codes.day_started_at < now() - interval '1 day')",
        user_id,
        purpose as _,
        code,
        LIFETIME_MINUTES,
    )
    .execute(pool)
    .await?
    .rows_affected();
    Ok(stored > 0)
}

/// Whether `code` is the account's live code, without spending a try: only to decide what
/// to do before `redeem`, which stays the judge.
pub async fn matches(
    pool: &PgPool,
    user_id: Uuid,
    purpose: CodePurpose,
    code: &str,
) -> sqlx::Result<bool> {
    sqlx::query_scalar!(
        r#"select exists(select 1 from email_codes
                         where user_id = $1 and purpose = $2 and attempts < 5
                           and expires_at > now() and code = $3) as "matches!""#,
        user_id,
        purpose as _,
        code,
    )
    .fetch_one(pool)
    .await
}

/// Spends one of the 5 tries of the account's live code: `true`, and the code gone, when
/// `code` is it.
pub async fn redeem(
    pool: &PgPool,
    user_id: Uuid,
    purpose: CodePurpose,
    code: &str,
) -> sqlx::Result<bool> {
    // Counting the try and comparing in one statement: concurrent guesses queue on the row
    // lock, so a burst of them can't all slip in before the count reaches 5.
    let matched = sqlx::query_scalar!(
        r#"update email_codes set attempts = attempts + 1
           where user_id = $1 and purpose = $2 and attempts < 5 and expires_at > now()
           returning code = $3 as "matched!""#,
        user_id,
        purpose as _,
        code,
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(false);
    if matched {
        sqlx::query!(
            "delete from email_codes where user_id = $1 and purpose = $2",
            user_id,
            purpose as _,
        )
        .execute(pool)
        .await?;
    }
    Ok(matched)
}

/// Deletes every live code of the account.
pub async fn delete_for_user(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("delete from email_codes where user_id = $1", user_id)
        .execute(conn)
        .await?;
    Ok(())
}
