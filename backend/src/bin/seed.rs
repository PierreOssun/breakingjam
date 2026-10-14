//! Dev seed: admin users, sample jams, dancers and crews (ARCHITECTURE §8).

use anyhow::Context;
use breakingjam::{auth::password, domain::user::Role};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

// Only the variants the seed uses; moves to `domain/event.rs` in M5.
#[derive(Clone, Copy, sqlx::Type)]
#[sqlx(type_name = "event_status", rename_all = "snake_case")]
enum EventStatus {
    Draft,
    Published,
    RegistrationClosed,
    Completed,
}

struct User {
    email: &'static str,
    display_name: &'static str,
    role: Role,
}

const ADMIN: User = User {
    email: "admin@breakingjam.local",
    display_name: "Admin",
    role: Role::Admin,
};
const SEED_ADMIN: User = User {
    email: "seed@breakingjam.local",
    display_name: "Seed Admin",
    role: Role::SeedAdmin,
};

struct Event {
    name: &'static str,
    city: &'static str,
    country: &'static str,
    timezone: &'static str,
    lat: f64,
    lng: f64,
    /// Start date relative to today, so the seed always has upcoming and past jams.
    starts_in_days: i32,
    length_days: i32,
    status: EventStatus,
}

#[rustfmt::skip]
const EVENTS: &[Event] = &[
    Event { name: "Paris Cypher Sessions", city: "Paris", country: "FR", timezone: "Europe/Paris", lat: 48.8566, lng: 2.3522, starts_in_days: 20, length_days: 2, status: EventStatus::Published },
    Event { name: "Berlin Floor Wars", city: "Berlin", country: "DE", timezone: "Europe/Berlin", lat: 52.5200, lng: 13.4050, starts_in_days: 35, length_days: 1, status: EventStatus::Published },
    Event { name: "Zurich Toprock Jam", city: "Zurich", country: "CH", timezone: "Europe/Zurich", lat: 47.3769, lng: 8.5417, starts_in_days: 50, length_days: 1, status: EventStatus::Published },
    Event { name: "Lyon Footwork Fest", city: "Lyon", country: "FR", timezone: "Europe/Paris", lat: 45.7640, lng: 4.8357, starts_in_days: 80, length_days: 2, status: EventStatus::Published },
    Event { name: "Amsterdam Freeze Frame", city: "Amsterdam", country: "NL", timezone: "Europe/Amsterdam", lat: 52.3676, lng: 4.9041, starts_in_days: 10, length_days: 1, status: EventStatus::RegistrationClosed },
    Event { name: "Seoul Power Moves", city: "Seoul", country: "KR", timezone: "Asia/Seoul", lat: 37.5665, lng: 126.9780, starts_in_days: 45, length_days: 2, status: EventStatus::Published },
    Event { name: "Tokyo Underground Cypher", city: "Tokyo", country: "JP", timezone: "Asia/Tokyo", lat: 35.6762, lng: 139.6503, starts_in_days: -30, length_days: 1, status: EventStatus::Completed },
    Event { name: "Taipei Breaking Open", city: "Taipei", country: "TW", timezone: "Asia/Taipei", lat: 25.0330, lng: 121.5654, starts_in_days: -60, length_days: 2, status: EventStatus::Completed },
    Event { name: "Bangkok Groove Battle", city: "Bangkok", country: "TH", timezone: "Asia/Bangkok", lat: 13.7563, lng: 100.5018, starts_in_days: -120, length_days: 1, status: EventStatus::Completed },
    Event { name: "Montpellier Kids Jam", city: "Montpellier", country: "FR", timezone: "Europe/Paris", lat: 43.6108, lng: 3.8767, starts_in_days: 140, length_days: 1, status: EventStatus::Draft },
];

struct Crew {
    name: &'static str,
    country: &'static str,
    city: &'static str,
}

#[rustfmt::skip]
const CREWS: &[Crew] = &[
    Crew { name: "Floor Lords", country: "FR", city: "Paris" },
    Crew { name: "Spin Syndicate", country: "DE", city: "Berlin" },
    Crew { name: "Alpine Breakers", country: "CH", city: "Zurich" },
    Crew { name: "Seoul Riders", country: "KR", city: "Seoul" },
    Crew { name: "Tokyo Freeze", country: "JP", city: "Tokyo" },
];

struct Dancer {
    name: &'static str,
    aliases: &'static [&'static str],
    country: &'static str,
    country2: Option<&'static str>,
    city: &'static str,
    handle: Option<&'static str>,
    notable: bool,
    /// Index into `CREWS` and the year joined (`None` = unknown).
    crew: Option<(usize, Option<i32>)>,
}

// "Kid Rocket" / "Kid Rockett" is a deliberate near-duplicate pair for merge testing.
#[rustfmt::skip]
const DANCERS: &[Dancer] = &[
    Dancer { name: "Kid Rocket", aliases: &["Rocket"], country: "FR", country2: None, city: "Paris", handle: Some("kidrocket_bj"), notable: true, crew: Some((0, Some(2015))) },
    Dancer { name: "Kid Rockett", aliases: &[], country: "FR", country2: None, city: "Paris", handle: None, notable: false, crew: None },
    Dancer { name: "Ventus", aliases: &[], country: "FR", country2: None, city: "Paris", handle: Some("ventus_bj"), notable: true, crew: Some((0, None)) },
    Dancer { name: "Bgirl Ember", aliases: &["Ember"], country: "FR", country2: Some("MA"), city: "Lyon", handle: Some("bgirlember_bj"), notable: true, crew: Some((0, Some(2019))) },
    Dancer { name: "Moonwalka", aliases: &[], country: "FR", country2: None, city: "Marseille", handle: None, notable: false, crew: None },
    Dancer { name: "Spinzilla", aliases: &[], country: "DE", country2: None, city: "Berlin", handle: Some("spinzilla_bj"), notable: true, crew: Some((1, Some(2012))) },
    Dancer { name: "Flexo", aliases: &[], country: "DE", country2: None, city: "Hamburg", handle: None, notable: false, crew: Some((1, None)) },
    Dancer { name: "Bgirl Lumen", aliases: &[], country: "DE", country2: Some("PL"), city: "Berlin", handle: Some("bgirllumen_bj"), notable: false, crew: Some((1, Some(2021))) },
    Dancer { name: "Krypt", aliases: &[], country: "DE", country2: None, city: "Cologne", handle: None, notable: false, crew: None },
    Dancer { name: "Atlas", aliases: &[], country: "CH", country2: None, city: "Zurich", handle: Some("atlas_bj"), notable: true, crew: Some((2, Some(2010))) },
    Dancer { name: "Bgirl Saffron", aliases: &[], country: "CH", country2: Some("IT"), city: "Lugano", handle: None, notable: false, crew: Some((2, None)) },
    Dancer { name: "Drift", aliases: &[], country: "CH", country2: None, city: "Geneva", handle: Some("drift_bj"), notable: false, crew: None },
    Dancer { name: "Halo", aliases: &[], country: "NL", country2: None, city: "Amsterdam", handle: Some("halo_bj"), notable: true, crew: None },
    Dancer { name: "Glitch", aliases: &[], country: "NL", country2: None, city: "Rotterdam", handle: None, notable: false, crew: None },
    Dancer { name: "Sensei Kai", aliases: &["Kai", "카이"], country: "KR", country2: None, city: "Seoul", handle: Some("senseikai_bj"), notable: true, crew: Some((3, Some(2008))) },
    Dancer { name: "Bgirl Kaida", aliases: &[], country: "KR", country2: None, city: "Busan", handle: Some("bgirlkaida_bj"), notable: true, crew: Some((3, Some(2018))) },
    Dancer { name: "Vortex", aliases: &[], country: "KR", country2: None, city: "Seoul", handle: None, notable: false, crew: Some((3, None)) },
    Dancer { name: "Mako", aliases: &[], country: "KR", country2: Some("US"), city: "Seoul", handle: Some("mako_bj"), notable: false, crew: None },
    Dancer { name: "Ronin", aliases: &["ローニン"], country: "JP", country2: None, city: "Tokyo", handle: Some("ronin_bj"), notable: true, crew: Some((4, Some(2011))) },
    Dancer { name: "Bgirl Pixel", aliases: &[], country: "JP", country2: None, city: "Osaka", handle: Some("bgirlpixel_bj"), notable: true, crew: Some((4, Some(2020))) },
    Dancer { name: "Tetris", aliases: &[], country: "JP", country2: None, city: "Tokyo", handle: None, notable: false, crew: Some((4, None)) },
    Dancer { name: "Noodle", aliases: &[], country: "JP", country2: None, city: "Nagoya", handle: None, notable: false, crew: None },
    Dancer { name: "Bgirl Mira", aliases: &[], country: "TW", country2: None, city: "Taipei", handle: Some("bgirlmira_bj"), notable: false, crew: None },
    Dancer { name: "Zephyr", aliases: &[], country: "TW", country2: None, city: "Taichung", handle: None, notable: false, crew: None },
    Dancer { name: "Pharo", aliases: &[], country: "TH", country2: None, city: "Bangkok", handle: Some("pharo_bj"), notable: false, crew: None },
    Dancer { name: "Jinx", aliases: &[], country: "TH", country2: None, city: "Chiang Mai", handle: None, notable: false, crew: None },
    Dancer { name: "Echo", aliases: &[], country: "GB", country2: None, city: "London", handle: Some("echo_bj"), notable: false, crew: None },
    Dancer { name: "Toprock Tina", aliases: &["Tina"], country: "GB", country2: Some("IE"), city: "Manchester", handle: None, notable: false, crew: None },
    Dancer { name: "Rhythmic", aliases: &[], country: "US", country2: None, city: "New York", handle: Some("rhythmic_bj"), notable: true, crew: None },
    Dancer { name: "Lil Nova", aliases: &[], country: "US", country2: None, city: "Los Angeles", handle: None, notable: false, crew: None },
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    breakingjam::init_tracing();

    let url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let password = std::env::var("SEED_PASSWORD").context("SEED_PASSWORD must be set")?;
    let pool = PgPool::connect(&url).await?;

    let seeded = sqlx::query_scalar!(
        r#"select exists(select 1 from app_users where email = $1) as "seeded!""#,
        ADMIN.email
    )
    .fetch_one(&pool)
    .await?;
    if seeded {
        tracing::info!("already seeded, nothing to do");
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    insert_user(&mut tx, &ADMIN, &password).await?;
    let seed_admin = insert_user(&mut tx, &SEED_ADMIN, &password).await?;
    let crews = insert_crews(&mut tx).await?;
    insert_dancers(&mut tx, seed_admin, &crews).await?;
    insert_events(&mut tx, seed_admin).await?;
    tx.commit().await?;

    tracing::info!(
        events = EVENTS.len(),
        dancers = DANCERS.len(),
        crews = CREWS.len(),
        "seeded; log in as {} or {} with SEED_PASSWORD",
        ADMIN.email,
        SEED_ADMIN.email,
    );
    Ok(())
}

async fn insert_user(conn: &mut PgConnection, user: &User, password: &str) -> anyhow::Result<Uuid> {
    let id = Uuid::now_v7();
    // Hash per user: a shared hash would reveal that the accounts share a password.
    let password_hash = password::hash(password.to_owned()).await?;
    sqlx::query!(
        "insert into app_users (id, email, password_hash, display_name, role, email_verified_at)
         values ($1, $2, $3, $4, $5, now())",
        id,
        user.email,
        password_hash,
        user.display_name,
        user.role as _,
    )
    .execute(conn)
    .await?;
    Ok(id)
}

async fn insert_crews(conn: &mut PgConnection) -> sqlx::Result<Vec<Uuid>> {
    let mut ids = Vec::with_capacity(CREWS.len());
    for crew in CREWS {
        let id = Uuid::now_v7();
        sqlx::query!(
            "insert into crews (id, name, country, city) values ($1, $2, $3, $4)",
            id,
            crew.name,
            crew.country,
            crew.city,
        )
        .execute(&mut *conn)
        .await?;
        ids.push(id);
    }
    Ok(ids)
}

async fn insert_dancers(
    conn: &mut PgConnection,
    created_by: Uuid,
    crews: &[Uuid],
) -> sqlx::Result<()> {
    // §4: the `seed` origin implies notable; the others are ordinary organizer-created rows.
    for dancer in DANCERS {
        let id = Uuid::now_v7();
        sqlx::query!(
            "insert into dancers
               (id, dancer_name, aliases, country, country2, city, instagram_handle, source, notable, created_by)
             values ($1, $2, $3, $4, $5, $6, $7,
                     (case when $8 then 'seed' else 'organizer' end)::dancer_source, $8, $9)",
            id,
            dancer.name,
            dancer.aliases as &[&str],
            dancer.country,
            dancer.country2,
            dancer.city,
            dancer.handle,
            dancer.notable,
            created_by,
        )
        .execute(&mut *conn)
        .await?;

        if let Some((crew, since_year)) = dancer.crew {
            sqlx::query!(
                "insert into crew_memberships (dancer_id, crew_id, since) values ($1, $2, make_date($3, 1, 1))",
                id,
                crews[crew],
                since_year,
            )
            .execute(&mut *conn)
            .await?;
        }
    }
    Ok(())
}

async fn insert_events(conn: &mut PgConnection, organizer: Uuid) -> sqlx::Result<()> {
    for event in EVENTS {
        let id = Uuid::now_v7();
        sqlx::query!(
            "insert into events
               (id, organizer_id, name, slug, status, starts_on, ends_on, timezone, city, country, lat, lng)
             values ($1, $2, $3, $4, $5,
                     current_date + $6::int, current_date + $6::int + $7::int - 1,
                     $8, $9, $10, $11, $12)",
            id,
            organizer,
            event.name,
            slug(event.name, id),
            event.status as _,
            event.starts_in_days,
            event.length_days,
            event.timezone,
            event.city,
            event.country,
            event.lat,
            event.lng,
        )
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// `"Paris Cypher Sessions"` → `"paris-cypher-sessions-3f9a1c"`; the suffix is the id's random tail.
fn slug(name: &str, id: Uuid) -> String {
    let id = id.simple().to_string();
    // Unicode-aware so non-Latin names keep their letters instead of collapsing to the suffix.
    name.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .chain(std::iter::once(id[id.len() - 6..].to_string()))
        .collect::<Vec<_>>()
        .join("-")
}
