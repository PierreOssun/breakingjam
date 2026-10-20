# BreakingJam

> For now, only the test version is deployed: [uat.breakingjam.com](https://uat.breakingjam.com).

- **Find a jam:** a map of upcoming jams, filtered by date and battle category, searchable by name, city or country.
- **Register a jam:** organisers create a jam, submit it for review, and run its battles, entries, results and lineup once a BreakingJam admin has approved it.
- **Dancer pages:** every dancer's upcoming and past jams, results and battle videos, with a generated pixel avatar. Dancers verify their page through Instagram.
- **Organiser pages:** the jams an organiser runs, verified the same way.
- **Admin area:** counts of jams, dancers and accounts, the jams waiting for approval and the Instagram claims.

UI in English, French and German. Scope, data model and decisions are in [`ARCHITECTURE_v0.1.md`](ARCHITECTURE_v0.1.md); the visual system is in [`DESIGN.md`](DESIGN.md).

## Stack

| | |
|---|---|
| API | Rust, axum, sqlx (Postgres 17), utoipa (OpenAPI 3.1) — `backend/` |
| Web | React 19, Vite, TypeScript, TanStack Query, React Router, Tailwind v4, MapLibre + Protomaps — `frontend/` |
| Edge | Cloudflare Worker serving the site and fronting the API container — `deploy/` |
| Database | Neon Postgres in production, Docker Compose locally |

## Running it locally

You need Rust (the version is pinned in `backend/rust-toolchain.toml`), Node 22, Docker, [`sqlx-cli`](https://crates.io/crates/sqlx-cli) and optionally [`just`](https://just.systems).

```sh
cp backend/.env.example backend/.env         # then fill in what you need (Google sign-in is optional)
cp frontend/.env.example frontend/.env       # VITE_PROTOMAPS_KEY for the map tiles
just dev                                     # Postgres, API on :8080, site on :5173
just seed                                    # admin accounts and demo jams, battles, dancers, crews (local only)
```

Without `just`: `docker compose up -d`, then `cargo run` in `backend/` (it migrates on start in debug builds) and `npm i && npm run dev` in `frontend/` (Vite proxies `/api` to `:8080`). `just --list` shows the other recipes (`reset-db`, `openapi`, `check`…).

The map starts on the visitor's country, which Cloudflare provides in production. Locally, set `DEV_COUNTRY=CH` (any ISO code) in `frontend/.env`; without it the map frames every jam.

The seeded accounts use `SEED_PASSWORD` from `backend/.env`:

- `admin@breakingjam.local`: the admin area (`/admin`), with two jams waiting for review.
- `seed@breakingjam.local` ("BreakingJam Team"): runs the demo jams; manage their dancers and lineups from their pages.
- `organizer@breakingjam.local` ("Cypher Collective"): an ordinary organiser whose jams wait for review.

## Tests

```sh
just check      # everything CI runs
```

- **API:**
  - Integration tests in `backend/tests/*.rs`, one fresh database per test (`#[sqlx::test]`). `tests/access.rs` checks every documented route against `openapi.json`: 401 without a session, 404 on unknown ids, 403 on others' resources, named field errors.
  - Unit tests in `backend/tests/unit/`, mirroring `src/`.
  - `openapi.json` is a snapshot; refresh it with `just openapi` after an API change.
- **Web:** Vitest and Testing Library in `frontend/tests/`, mirroring `src/`. Pages are tested against a mocked API, the map against a stand-in for MapLibre.
- **Edge:** `deploy/tests/` for the Worker's helpers.

## Deploying

Production and UAT run on Cloudflare. `main` is for development; pushing to the `uat` or `prod` branch runs CI, snapshots and migrates Neon and deploys that target. The one-time setup, secrets and operations are in [`deploy/README.md`](deploy/README.md).

## Repository

```
backend/     Rust API, migrations, OpenAPI snapshot, tests
frontend/    React app, translations, tests
deploy/      Cloudflare Worker and wrangler config
milestones/  what each build step delivered and decided
```

Contributor rules are in [`CLAUDE.md`](CLAUDE.md) and [`CONVENTIONS.md`](CONVENTIONS.md).
