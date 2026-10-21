# Milestone 1 — Repo skeleton, compose, CI, health endpoint, Dockerfile

Build order point 1 of `ARCHITECTURE.md` §11.

## Done

- **Monorepo layout (§3)**: the Rust crate moved from the repo root to `backend/`; new `frontend/` app. Root holds `docker-compose.yml`, `CONVENTIONS.md`, `.github/workflows/ci.yml`.
- **Backend** (`backend/`):
  - axum 0.8 + tokio; `src/lib.rs` exposes `app()` so integration tests drive the real router.
  - `GET /api/health` → `200 {"status":"ok","version":"0.1.0"}` (`src/api/health.rs`).
  - `tower_http` `TraceLayer` with `x-request-id` (UUID, set + propagated to the response). Spans log the path only, never the query string (OAuth codes).
  - `tracing-subscriber`: pretty by default, JSON when `LOG_FORMAT=json` (set in the Docker image); filter via `RUST_LOG`.
  - Graceful shutdown on Ctrl+C / SIGTERM. Port from `APP_PORT` (default 8080).
  - `rust-toolchain.toml` pins Rust 1.99.0 (exact, to match the Docker image toolchain).
  - `tests/health.rs`: health 200 + request id header, unknown route 404.
  - `.env.example` with every key from §5 Config.
- **Dockerfile** (`backend/Dockerfile`): multi-stage with `cargo-chef` (rust:1.99-slim-trixie); `rust-toolchain.toml` is copied before `cook` so dependency layers stay cached, runtime `distroless/cc-debian13:nonroot`.
- **Compose**: `postgres:17` on 5432 with healthcheck and a named volume (user/password/db `breakingjam`).
- **Frontend** (`frontend/`): Vite 7 + React 19 + TypeScript strict, ESLint 9 (flat config) + Prettier (defaults), Vitest + Testing Library (jsdom). Scripts `dev`, `build`, `lint`, `typecheck`, `test`, `format`. Dev server proxies `/api` → `:8080`. `.env.example` with `VITE_API_URL`, `VITE_PROTOMAPS_KEY`, `VITE_TILES_URL`.
- **CI** (`.github/workflows/ci.yml`), on PR and push to `main`:
  - `backend`: `cargo fmt --check`, `cargo clippy --all-targets -D warnings`, `cargo test`.
  - `frontend`: `npm ci`, lint, typecheck, test, build.
  - `docker`: builds the backend image (no push).
- `.gitignore` ignores `.env*` (incl. Vite `.env.local`, `.env.*.local`) in every directory (`.env.example` kept), `target/`, `node_modules/`, `dist/`.

## Verified locally

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (2 tests) — pass.
- `npm run lint`, `typecheck`, `test` (1 test), `build` — pass.
- Docker image build verified later, during milestone 2: builds, serves `/api/health`, logs JSON (58.6 MB).

## Deferred to later milestones

- Postgres service, `SQLX_OFFLINE` and `cargo sqlx prepare --check` in CI → milestone 2 (no sqlx / queries yet).
- `Config::from_env()`, `AppState`, `AppError`, DB-aware health → milestone 3.
- Tailwind, routing, i18n → milestone 9. README → milestone 13.

## Run it

From the repo root, one terminal per line. `.env` is created from the template only if it does not exist yet.

```
docker compose up -d
(cd backend && { [ -f .env ] || cp .env.example .env; } && cargo run)                  # http://localhost:8080/api/health
(cd frontend && { [ -f .env ] || cp .env.example .env; } && npm i && npm run dev)     # http://localhost:5173
```

## Review fixes (after `/code-review`)

- Dockerfile: toolchain file copied before `cargo chef cook`; toolchain pinned to `1.99.0`.
- Request span logs `uri.path()` only.
- `.gitignore`: `.env*` with `!.env.example`.
- `//!` module headers and `///` on public items in `lib.rs`, `api/mod.rs`, `api/health.rs`.
- Dropped unused `tower-http` `util` feature.
- CI backend job: removed the unused Postgres service and sqlx env until milestone 2.
- `init_tracing`: single subscriber chain with optional JSON / pretty layers.
- Removed `frontend/.prettierrc.json` (CLAUDE.md: Prettier with defaults) and reformatted.

Still open: `frontend/.env` holds backend Google OAuth secrets — move to `backend/.env` (and consider rotating). Left to the author.
