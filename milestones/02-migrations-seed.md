# Milestone 2 — Migrations (all tables), seed binary

Build order point 2 of `ARCHITECTURE.md` §11.

## Done

- **Migration** `backend/migrations/20261014000000_init.sql`: every §4 table, enum and index, plus:
  - `citext` extension.
  - `set_updated_at()` trigger on every table with `updated_at` (`app_users`, `dancers`, `crews`, `events`, `battles`, `entries`). `updated_at` is never set in code.
  - `battles`: `age_max >= age_min` written as a table-level check (same rule).
- **Schema changes agreed during review** (also applied to §4 of the architecture doc):
  - `crew_memberships`: `unique nulls not distinct (dancer_id, crew_id, since)` instead of the primary key. A PK forces `since` NOT NULL, but the API treats it as optional (unknown join date).
  - `dancer_claims_one_pending_key`: partial unique index, one `pending` claim per (dancer, user).
- **Seed** `cargo run --bin seed` (`backend/src/bin/seed.rs`):
  - `admin@breakingjam.local` (admin) and `seed@breakingjam.local` (seed_admin), password from `SEED_PASSWORD`, Argon2id.
  - 10 jams (6 Europe, 4 Asia) with coordinates; dates relative to today: 5 published / registration_closed upcoming, 3 completed past, 1 draft. Slugs `name-<6 hex of id>`.
  - 30 fictional dancers (half with handles, some with aliases and a second country), near-duplicate pair *Kid Rocket* / *Kid Rockett* for merge testing.
  - 5 crews, 14 memberships (5 with unknown `since`).
  - Runs in one transaction; skips if the admin user already exists.
- **Tests** `backend/tests/schema.rs` (`#[sqlx::test]`): `updated_at` trigger, case-insensitive handle uniqueness released by soft delete, unknown-`since` membership allowed once, one pending claim, battle format/age checks.
- **Offline query data** `backend/.sqlx/` (18 queries, `cargo sqlx prepare -- --all-targets`), to be committed.
- **CI** backend job: Postgres 17 service, `SQLX_OFFLINE=true`, installs `sqlx-cli 0.9.0`, `sqlx migrate run`, fmt, clippy, test, `cargo sqlx prepare --check -- --all-targets`, seed run twice (second must be a no-op).
- **Dockerfile**: `SQLX_OFFLINE=true` in the builder stage.
- `backend/.env.example`: `SEED_PASSWORD`.

## New crates

Per CLAUDE.md, one commit per crate. Suggested messages:

- `chore: add sqlx` — Postgres driver, compile-checked queries, migrations (§2 stack).
- `chore: add uuid` — UUIDv7 primary keys generated in the app (§4).
- `chore: add argon2` — Argon2id password hashing (§5 Auth); used by the seed now, by auth in M4.
- `chore: add dotenvy` — loads `backend/.env` (§5 Config); used by the seed now, by `Config::from_env()` in M3.
- `chore: add anyhow` — error type for the seed binary (CLAUDE.md: `anyhow` only in `main` and seed).

`cargo tree -d`: the duplicates (`sha2`, `digest`, `getrandom`, …) come from argon2 0.6 using newer RustCrypto crates than sqlx 0.9. Nothing to dedupe on our side.

## Verified locally

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` (online and `SQLX_OFFLINE=true`), `cargo test` (7 tests) — pass.
- `sqlx migrate run` on the compose DB; seed run twice (second: "already seeded").
- `cargo sqlx prepare --check -- --all-targets` — pass.
- `docker build backend` and container `/api/health` — pass.

## Deferred

- `sqlx::migrate!()` at startup in dev → milestone 3 (needs the pool in `AppState`).
- Rust enums mirroring the Postgres enums → with the domain types they belong to (M3+). The seed casts text (`$1::text::user_role`).
- Slug generation moves to `domain/event.rs` in milestone 5.

## Run it

From the repo root:

```
docker compose up -d
(cd backend && sqlx migrate run && cargo run --bin seed)   # needs DATABASE_URL and SEED_PASSWORD in backend/.env
```

`sqlx-cli`: `cargo install sqlx-cli --locked --no-default-features --features rustls,postgres`.
