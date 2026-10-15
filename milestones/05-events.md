# Milestone 5 — Events CRUD + status transitions + `events.geojson`

Build order point 5 of `ARCHITECTURE_v0.1.md` §11.

## Decisions (asked at the start, recorded in §5 of the architecture doc)

- **Organisers**: any logged-in user may create a jam; their first one promotes `user` → `organizer` in the same transaction. Jams start as drafts.
- **Map**: `events.geojson` shows `published` + `registration_closed` jams that have coordinates.
- **Status machine**: a plain enum + `EventStatus::apply(Transition)`, not typestate (CLAUDE.md lists typestate, but the status comes from the DB at runtime, so every endpoint would match anyway).

## Routes (`backend/src/api/events.rs`)

| Route | Who | Result |
|---|---|---|
| `GET /api/events?status&country&from&to&mine&cursor&limit` | anyone | `{ items, next_cursor }`, ordered by `(starts_on, id)`. Public statuses only; `mine=true` (login) lists your own jams incl. drafts. `from`/`to` match jams overlapping the range. |
| `GET /api/events.geojson` | anyone | FeatureCollection, `[lng, lat]` points, properties `id, name, slug, starts_on, city, country`. |
| `GET /api/events/{id_or_slug}` | anyone | The jam. Drafts are 404 except for the owner and `seed_admin`+. |
| `POST /api/events` | logged in | 201, draft, slug `name-words-<6 hex of id>`. |
| `PUT /api/events/{id}` | owner, `seed_admin`+ | Replaces the editable fields; slug and status never change. |
| `DELETE /api/events/{id}` | owner, `seed_admin`+ | 204, soft delete (`deleted_at`); invisible everywhere afterwards. |
| `POST /api/events/{id}/publish` · `close-registration` · `complete` · `cancel` | owner, `seed_admin`+ | 200 + jam, or 409 for a transition the status doesn't allow. |

Writes on a jam you can't see (someone else's draft) are 404; on a public jam you don't own, 403.

## Domain (`backend/src/domain/event.rs`)

- `EventStatus` (sqlx + serde), `Transition`, `apply` (strictly §4: draft → published → registration_closed → completed; cancel from the first three).
- `Event` (serialized directly as the API response; no secret fields), `can_write`, `visible_to`.
- `EventFields`: the request body for POST/PUT with field validation: name/city not blank, country `^[A-Z]{2}$`, timezone shape `Area/Location` or `UTC`, lat/lng ranges, URLs. Struct-level `validate(schema(…))` rules add `ends_on >= starts_on` and lat/lng set together, so the extractor reports them with the field errors (moved there in the 14 Oct 2026 cleanup pass; originally a `cross_field_errors()` method called by the handlers).
- `slug()` moved here from the seed (your Unicode-aware version); `not_blank` moved to `domain/mod.rs` and is shared with auth.
- Optional text fields are trimmed in SQL and `""` becomes null.

## Pagination (`backend/src/api/page.rs`)

`limit` defaults to 50 and is clamped to 1..=200. One extra row is fetched to decide `next_cursor`. Event cursors are `{starts_on}_{id}`; garbage → 422 on field `cursor`.

## Tests

- Unit (+7): every allowed and rejected transition, slug (incl. Korean), `can_write`, timezone/country shapes, page limit and cursor.
- Integration `tests/events.rs` (9): create + promotion, login required, field then cross-field validation, draft visibility (owner / stranger / anonymous / seed_admin / after publish, by id and slug), update rights + stable slug, soft delete, full status machine incl. 409s and 404-vs-403, list filters + pagination + `mine`, GeoJSON contents and shape.
- `tests/test_app`: `put`, `delete`, `sign_up` helpers.

## New crate

- `chore: add chrono` — `NaiveDate` / `DateTime<Utc>` for event dates and timestamps, serialized as ISO 8601 (§5 API: RFC 3339). sqlx `chrono` feature enabled.

## Verified locally

- `cargo fmt --check`, clippy (online and offline), `cargo test` (53 tests), `cargo sqlx prepare --check -- --all-targets`, `npm test`, `docker build` — pass.
- Real binary + seed on a scratch DB: the map has the 6 upcoming public seed jams; list paging with `limit=3` returns a cursor; Zurich jam resolves by slug.

## Deferred / known gaps

- Bad path or query values (non-UUID id, unknown `status`) get axum's plain-text 400, not the error envelope. Worth one small rejection mapper before the frontend relies on it.
- Timezone and country are shape-checked, not checked against the tz database or the ISO list.
- No shortcut `published → completed`: organisers close registration first, per §4.
- `utoipa::ToSchema` on `Event`, `EventFields`, `Page`, GeoJSON types → milestone 8.
