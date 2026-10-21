# Milestone 3 — `AppError`, `AppState`, config, tracing

Build order point 3 of `ARCHITECTURE.md` §11.

## Done

- **Config** (`backend/src/config.rs`): `Config::from_env()` reads every §5 variable. `APP_PORT` defaults to 8080; all others are required and must not be empty. It fails fast and lists **every** missing variable in one message, e.g. `missing environment variables: DATABASE_URL, GOOGLE_CLIENT_ID`. `from_lookup` takes the source as a closure so tests don't mutate the process env (`set_var` is `unsafe` in edition 2024).
- **State** (`backend/src/state.rs`): `AppState { pool: PgPool, config: Arc<Config> }`. `app(state)` and every `api::*::router()` now return `Router<AppState>`.
- **Errors** (`backend/src/error.rs`): `AppError { NotFound, Validation(Vec<FieldError>), Unauthorized, Forbidden, Conflict(String), Internal(anyhow::Error) }` per §5.
  - JSON envelope `{ "error": { code, message, fields? } }`; `fields` only for validation.
  - Status/code: 404 `not_found`, 422 `validation`, 401 `unauthorized`, 403 `forbidden`, 409 `conflict`, 500 `internal`.
  - `Internal` logs the cause with `tracing::error!` and returns `internal server error`.
  - `From<sqlx::Error>`: `RowNotFound` → `NotFound`, unique violation → `Conflict("already exists (<constraint>)")`, rest → `Internal`.
- **main**: `dotenvy` → tracing → `Config::from_env()` → pool → `sqlx::migrate!()` in **debug builds only** (release / Docker rely on `sqlx migrate run`, §5) → serve. Returns `anyhow::Result`, so the startup `expect`s from M1 are gone.
- **Health**: `GET /api/health` runs `select 1`; if the database is down it returns the 500 envelope.
- **Tracing**: one INFO line per request (`status`, `latency`) inside a span with `method`, `path`, `request_id`. Pretty in dev, JSON with `LOG_FORMAT=json`.
- **Tests**:
  - Unit: config (default port, all missing listed, invalid port) and error envelopes (not found, validation fields, internal hides the cause, `RowNotFound`).
  - Integration: health 200 + request id, health 500 when the pool is closed, 404, and a unique violation mapped to `Conflict` with the constraint name.

## New crate

- `chore: add thiserror` — derives `Display`/`Error` for `AppError` and `ConfigError` (CLAUDE.md: `thiserror` for typed errors).

## Doc conflict, followed ARCHITECTURE

- `AppError::Internal(anyhow::Error)` comes from §5. CLAUDE.md says "`anyhow` only in `main` and the seed binary". I followed §5 because it names the variants explicitly. Switching to `Internal(Box<dyn Error + Send + Sync>)` would be a one-line change if you prefer.
- `SESSION_SECRET` was loaded and required but unused ("reserved" in §5); dropped from the config and §5 in the 14 Oct 2026 cleanup pass.

## Verified locally

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` (online and `SQLX_OFFLINE=true`), `cargo test` (16 tests), `cargo sqlx prepare --check -- --all-targets`, `npm test` — pass.
- Binary with no env: exits with the full list of missing variables.
- Binary on a fresh scratch database: migrates on startup, `/api/health` 200, `/api/nope` 404, JSON request log, `?code=…` not logged.
- `docker build backend` — pass.

## Dev database needs a reset

`migrations/20261014000000_init.sql` was edited after it was applied (the `battles` kids/adult checks now require `age_max`/`age_min`). sqlx refuses to start against the old dev DB: `migration 20261014000000 was previously applied but has been modified`. The migration has never left this machine, so reset rather than add a new migration:

```
(cd backend && sqlx database reset -y && cargo run --bin seed)
```

## Deferred

- CORS for `FRONTEND_ORIGIN`: not needed while Vite proxies `/api` in dev and prod is same-origin (§9). Add the layer only if a cross-origin dev setup appears.
- `validator` → `FieldError` conversion arrives with the first DTOs (M4).
