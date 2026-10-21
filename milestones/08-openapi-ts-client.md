# Milestone 8 — utoipa doc for everything above; generate TS client

Build order point 8 of `ARCHITECTURE.md` §11.

## Done

### Backend

- **Routes and docs from one source**: every module's `router()` is now a `utoipa_axum::OpenApiRouter`, built with `.routes(routes!(…))` from handlers annotated with `#[utoipa::path]`. A handler can't be routed without being documented, or documented without being routed.
- **48 operations / 33 paths**, each with tag, explicit `operation_id` (unique, e.g. `list_events`, `search_dancers`), summary from its `///` line, params, request body, success response and the error statuses it can return (all `ErrorEnvelope`).
- **`src/openapi.rs`** (§3): `ApiDoc` with title, description, 8 tags, and the `session` security scheme (`apiKey` in cookie `bj_session`). Protected operations declare `security(("session" = []))`; optional-auth reads declare `security((), ("session" = []))`.
- **Serving**: `GET /api/openapi.json` always; Swagger UI at `/api/docs` **only in debug builds** (`#[cfg(debug_assertions)]`, assets vendored, no download at build time). The release image answers 404 there.
- **Schemas**: `ToSchema` on every domain type and DTO, `IntoParams` on every query struct. Generic pages come out as `Page_Event`, `Page_DancerSummary`, …; the merged-dancer response is a `oneOf`, flattened types are `allOf`, `Option` fields are `["T", "null"]` (OpenAPI 3.1).
- **Error envelope** is now an owned public type (`ErrorEnvelope { error: ErrorBody { code, message, fields } }`) so it can be documented; same JSON as before.
- `breakingjam::openapi()` returns the document without a server or database.

### Frontend

- `openapi-fetch` (runtime, ~6 KB) + `openapi-typescript` (dev).
- `npm run gen:api` fetches `http://localhost:8080/api/openapi.json` → `src/api/schema.d.ts` (§6, unchanged).
- `src/api/client.ts`: `api` = `createClient<paths>({ baseUrl: VITE_API_URL ?? '' })`, plus `Schemas` = `components['schemas']`.
- `src/vite-env.d.ts`: typed `VITE_API_URL`, `VITE_PROTOMAPS_KEY`, `VITE_TILES_URL`.

## Drift guard (addition to §7, recorded in the doc)

- `backend/openapi.json` is committed. `tests/openapi.rs` fails when it differs from `breakingjam::openapi()`. Regenerate with `UPDATE_OPENAPI=1 cargo test --test openapi`.
- CI frontend job regenerates `schema.d.ts` from that file and fails on `git diff`. Backend change → spec snapshot → TS types: each link is checked.
- `every_ref_resolves` test: fails on dangling `$ref`s.
  - Found one: `?scope=` of `GET /dancers/{id}/events` referenced an unregistered `Scope` schema (utoipa doesn't register schemas used only in query params). Fixed with `#[param(inline)]`.
  - Confirmed the test fails without the fix.

## New crates / packages

- `chore: add utoipa` — OpenAPI 3.1 from code (§2). v6.0 (Sep 2026); 3.1 is still its default.
- `chore: add utoipa-axum` — registers routes and their docs together, so they can't drift.
- `chore: add utoipa-swagger-ui` — `/api/docs` in dev (§5), `vendored` so builds need no network.
- npm: `openapi-fetch`, `openapi-typescript` (§2 API contract).

## Verified locally

- `cargo fmt --check`, clippy (online and offline), `cargo test` (98 tests), `cargo sqlx prepare --check -- --all-targets` — pass.
- `npm run lint`, `typecheck`, `test`, `build`, `prettier --check` — pass.
- Real debug binary on :8080: `/api/openapi.json` 200 and identical to the committed snapshot; `/api/docs` serves Swagger UI; `npm run gen:api` against it produces byte-for-byte the same `schema.d.ts` as the CI check.
- Release Docker image: `/api/openapi.json` 200, `/api/docs/` 404.

## Known looseness

- Fields that are `Option` in Rust are not in `required`, so TS types read `verified_at?: string | null` although responses always include them. Harmless for reads; tightening means `#[schema(required = true)]` per response field.
- Validation limits (`max_length`, ranges) live in `validator` attributes and are not repeated in the schema.
