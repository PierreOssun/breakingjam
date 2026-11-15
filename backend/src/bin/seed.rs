//! Local and UAT seed: the seed accounts, the curated past jams of `data/` and the real upcoming jams of `data/upcoming.toml` (ARCHITECTURE §8).

use std::path::{Path, PathBuf};

use anyhow::Context;
use breakingjam::{
    auth::password,
    config::Secret,
    dataset::{self, import, upcoming},
    domain::user::Role,
};
use sqlx::{PgConnection, PgPool, postgres::PgConnectOptions};
use uuid::Uuid;

struct User {
    email: &'static str,
    display_name: &'static str,
    role: Role,
}

const SUPER_ADMIN: User = User {
    email: "super@breakingjam.local",
    display_name: "Super Admin",
    role: Role::SuperAdmin,
};
const ADMIN: User = User {
    email: "admin@breakingjam.local",
    display_name: "Admin",
    role: Role::Admin,
};
const SEED_ADMIN: User = User {
    email: "seed@breakingjam.local",
    display_name: "BreakingJam Team",
    role: Role::SeedAdmin,
};
const ORGANIZER: User = User {
    email: "organizer@breakingjam.local",
    display_name: "Cypher Collective",
    role: Role::Organizer,
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    breakingjam::init_tracing();

    let url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let password = std::env::var("SEED_PASSWORD").context("SEED_PASSWORD must be set")?;
    let pepper = std::env::var("PASSWORD_PEPPER").context("PASSWORD_PEPPER must be set")?;
    let accounts = Accounts {
        password: &password,
        pepper: &Secret(pepper),
    };
    let options: PgConnectOptions = url.parse()?;
    // Accounts sharing one known password must never reach production. A remote database (UAT)
    // is seeded only when SEED_ALLOW_HOST names its host exactly.
    let host = options.get_host();
    let allowed = std::env::var("SEED_ALLOW_HOST").is_ok_and(|allowed| allowed == host);
    anyhow::ensure!(
        allowed || matches!(host, "localhost" | "127.0.0.1" | "::1"),
        "the seed only runs against a local database or SEED_ALLOW_HOST, not {host}"
    );
    let pool = PgPool::connect_with(options).await?;

    let seeded = sqlx::query_scalar!(
        r#"select exists(select 1 from app_users where email = $1) as "seeded!""#,
        ADMIN.email
    )
    .fetch_one(&pool)
    .await?;
    if seeded {
        // Their *.local emails get no reset code, so a new pepper or password is applied here.
        for user in [&SUPER_ADMIN, &ADMIN, &SEED_ADMIN, &ORGANIZER] {
            accounts.reset_password(&pool, user).await?;
        }
        tracing::info!("already seeded: only the seed accounts' passwords were set again");
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    accounts.insert(&mut tx, &SUPER_ADMIN).await?;
    accounts.insert(&mut tx, &ADMIN).await?;
    let team = accounts.insert(&mut tx, &SEED_ADMIN).await?;
    accounts.insert(&mut tx, &ORGANIZER).await?;
    let imported = import_data(&mut tx, team).await?;
    let today = chrono::Utc::now().date_naive();
    let upcoming = upcoming::insert(&mut tx, &upcoming::load(&data_dir())?, team, today).await?;
    tx.commit().await?;

    tracing::info!(
        past = imported.events,
        upcoming = upcoming.jams,
        drafts = upcoming.drafts.len(),
        dancers = imported.new_dancers,
        crews = imported.crews,
        "seeded; log in as {}, {} or {} with SEED_PASSWORD",
        ADMIN.email,
        SEED_ADMIN.email,
        ORGANIZER.email,
    );
    Ok(())
}

/// The repository's `data/` folder.
fn data_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../data")
}

/// The past jams of `data/` that pass `data check`, owned by the seed admin; the rest is logged.
async fn import_data(conn: &mut PgConnection, owner: Uuid) -> anyhow::Result<import::Imported> {
    let (data, unreadable) = dataset::load(&data_dir());
    for error in &unreadable {
        tracing::debug!(%error, "data file left out");
    }
    let imported = import::insert_all(conn, &data, owner).await?;
    for why in &imported.skipped {
        tracing::debug!(why, "left out");
    }
    tracing::info!(
        jams = imported.events,
        left_out = imported.skipped.len() + unreadable.len(),
        "imported data/ (RUST_LOG=seed=debug lists what was left out and why)"
    );
    Ok(imported)
}

/// How the seed accounts log in: one password, hashed with the site's pepper.
struct Accounts<'a> {
    password: &'a str,
    pepper: &'a Secret,
}

impl Accounts<'_> {
    /// A hash per account: a shared one would reveal that the accounts share a password.
    async fn hash(&self) -> anyhow::Result<String> {
        Ok(password::hash(self.password.to_owned(), self.pepper).await?)
    }

    async fn insert(&self, conn: &mut PgConnection, user: &User) -> anyhow::Result<Uuid> {
        let id = Uuid::now_v7();
        sqlx::query!(
            "insert into app_users (id, email, password_hash, display_name, role, email_verified_at)
             values ($1, $2, $3, $4, $5, now())",
            id,
            user.email,
            self.hash().await?,
            user.display_name,
            user.role as _,
        )
        .execute(conn)
        .await?;
        Ok(id)
    }

    async fn reset_password(&self, pool: &PgPool, user: &User) -> anyhow::Result<()> {
        sqlx::query!(
            "update app_users set password_hash = $2 where email = $1",
            user.email,
            self.hash().await?,
        )
        .execute(pool)
        .await?;
        Ok(())
    }
}
