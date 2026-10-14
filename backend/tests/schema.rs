//! Constraints the schema enforces on its own, independent of any handler.

use sqlx::PgPool;
use uuid::Uuid;

/// True when the query failed on a unique index, not on some unrelated error.
fn unique_violation<T>(result: &sqlx::Result<T>) -> bool {
    matches!(result, Err(e) if e.as_database_error().is_some_and(|e| e.is_unique_violation()))
}

/// True when the query failed on a check constraint, not on some unrelated error.
fn check_violation<T>(result: &sqlx::Result<T>) -> bool {
    matches!(result, Err(e) if e.as_database_error().is_some_and(|e| e.is_check_violation()))
}

async fn user(pool: &PgPool) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into app_users (id, email, display_name) values ($1, $2, 'Test')",
        id,
        format!("{id}@test.local"),
    )
    .execute(pool)
    .await
    .unwrap();
    id
}

async fn dancer(pool: &PgPool, handle: Option<&str>) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into dancers (id, dancer_name, country, instagram_handle) values ($1, 'Test', 'FR', $2)",
        id,
        handle,
    )
    .execute(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test]
async fn updated_at_is_set_by_trigger(pool: PgPool) {
    let id = user(&pool).await;
    sqlx::query!(
        "update app_users set updated_at = now() - interval '1 hour' where id = $1",
        id
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query!(
        "update app_users set display_name = 'Renamed' where id = $1",
        id
    )
    .execute(&pool)
    .await
    .unwrap();

    let fresh = sqlx::query_scalar!(
        r#"select updated_at > now() - interval '1 minute' as "fresh!" from app_users where id = $1"#,
        id
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(fresh);
}

#[sqlx::test]
async fn instagram_handle_is_unique_ignoring_case_until_soft_deleted(pool: PgPool) {
    let first = dancer(&pool, Some("kidrocket")).await;

    let duplicate = sqlx::query!(
        "insert into dancers (id, dancer_name, country, instagram_handle) values ($1, 'Other', 'DE', 'KidRocket')",
        Uuid::now_v7(),
    )
    .execute(&pool)
    .await;
    assert!(unique_violation(&duplicate));

    sqlx::query!("update dancers set deleted_at = now() where id = $1", first)
        .execute(&pool)
        .await
        .unwrap();
    dancer(&pool, Some("kidrocket")).await;
}

#[sqlx::test]
async fn crew_membership_allows_unknown_since_once(pool: PgPool) {
    let dancer = dancer(&pool, None).await;
    let crew = Uuid::now_v7();
    sqlx::query!("insert into crews (id, name) values ($1, 'Crew')", crew)
        .execute(&pool)
        .await
        .unwrap();

    let insert = || {
        sqlx::query!(
            "insert into crew_memberships (dancer_id, crew_id, since) values ($1, $2, null)",
            dancer,
            crew,
        )
        .execute(&pool)
    };
    insert().await.unwrap();
    assert!(
        unique_violation(&insert().await),
        "two unknown-since rows for the same pair must conflict"
    );
}

#[sqlx::test]
async fn only_one_pending_claim_per_dancer_and_user(pool: PgPool) {
    let user = user(&pool).await;
    let dancer = dancer(&pool, None).await;

    let claim = |status: &'static str| {
        sqlx::query!(
            "insert into dancer_claims (id, dancer_id, user_id, code, status)
             values ($1, $2, $3, 'BJ-TEST', $4::text::claim_status)",
            Uuid::now_v7(),
            dancer,
            user,
            status,
        )
        .execute(&pool)
    };
    claim("rejected").await.unwrap();
    claim("pending").await.unwrap();
    assert!(unique_violation(&claim("pending").await));
}

#[sqlx::test]
async fn battle_checks_reject_inconsistent_formats(pool: PgPool) {
    let organizer = user(&pool).await;
    let event = Uuid::now_v7();
    sqlx::query!(
        "insert into events (id, organizer_id, name, slug, starts_on, ends_on, timezone, city, country)
         values ($1, $2, 'Jam', 'jam', current_date, current_date, 'Europe/Paris', 'Paris', 'FR')",
        event,
        organizer,
    )
    .execute(&pool)
    .await
    .unwrap();

    let battle = |format: &'static str,
                  team_size: Option<i16>,
                  age: &'static str,
                  age_min: Option<i16>,
                  age_max: Option<i16>| {
        sqlx::query!(
            "insert into battles (id, event_id, name, format, team_size, age, age_min, age_max)
             values ($1, $2, 'Battle', $3::text::battle_format, $4, $5::text::battle_age, $6, $7)",
            Uuid::now_v7(),
            event,
            format,
            team_size,
            age,
            age_min,
            age_max,
        )
        .execute(&pool)
    };
    battle("team", Some(1), "adult", Some(18), None)
        .await
        .unwrap();
    battle("seven_to_smoke", None, "adult", Some(40), None)
        .await
        .unwrap();
    battle("team", Some(2), "kids", Some(8), Some(17))
        .await
        .unwrap();
    battle("na", None, "na", None, None).await.unwrap();
    let rejected = [
        (
            battle("team", None, "adult", Some(18), None).await,
            "team needs team_size",
        ),
        (
            battle("team", Some(1), "adult", None, None).await,
            "adult needs age_min",
        ),
        (
            battle("team", Some(2), "kids", Some(8), None).await,
            "kids need age_max",
        ),
        (
            battle("team", Some(2), "kids", Some(8), Some(18)).await,
            "kids are 17 max",
        ),
    ];
    for (result, why) in rejected {
        assert!(check_violation(&result), "{why}");
    }
}
