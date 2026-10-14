# Milestone 6 — Dancers CRUD + search + `dancers/{id}/events`; crews + memberships

Build order point 6 of `ARCHITECTURE_v0.1.md` §11.

## Routes

### Dancers (`backend/src/api/dancers.rs`)

| Route | Who | Result |
|---|---|---|
| `GET /api/dancers?q&country&cursor&limit` | anyone | Search-before-create. `q` matches name, alias or handle (`@` optional), case-insensitive substring; `%`/`_` are literal. `country` matches either flag. Notable dancers first, then by name. Each item: `id, dancer_name, aliases, country, country2, city, instagram_handle, verified, crews`. Deleted and merged rows hidden. |
| `GET /api/dancers/{id}` | anyone | Profile + current crews (`id, name, since`) + `can_edit` for the caller. `notable`, `user_id`, `created_by` are never exposed. |
| `GET /api/dancers/{id}/events?scope=upcoming\|past` | anyone | `{ upcoming, past }` from entries and staff at public jams (no drafts, no deleted). Upcoming = `starts_on >= today`, by date; past most recent first. Item: `event`, `battle` (null for staff), `role` (`competitor`, `judge`, `dj`, `mc`, `organizer`, `other`), `entry_status`, `reached`, `final_rank`, `video_url`. |
| `POST /api/dancers` | logged in | 201. `source` from the creator's role: `user` → `self`, `organizer` → `organizer`, `seed_admin`+ → `seed` (+ `notable`). Handle stored lower case without `@`; 409 when taken. |
| `PUT /api/dancers/{id}` | see below | Replaces the profile fields. |
| `DELETE /api/dancers/{id}` | `seed_admin`+ | 204, soft delete. |

**Who may edit (M6 subset of §4/§5):** `seed_admin`+ always; a verified dancer only by its owner; an unverified dancer by its creator. M7b widens unverified dancers to every logged-in user, with `dancer_edits` as the audit log, as §4 describes.

### Crews (`backend/src/api/crews.rs`)

| Route | Who | Result |
|---|---|---|
| `GET /api/crews?q&cursor&limit` | anyone | Name substring, by name. |
| `GET /api/crews/{id}` | anyone | Crew + current members (`dancer_id, dancer_name, country, since`). |
| `POST` / `PUT` / `DELETE /api/crews/{id}` | `organizer`+ (§5) | Create 201, update, soft delete 204. |
| `POST /api/crews/{id}/members` `{dancer_id, since?}` | `organizer`+ | 201 + crew with members. 404 for an unknown crew or dancer, 409 if already a current member. |
| `DELETE /api/crews/{id}/members/{dancer_id}` | `organizer`+ | Sets `until = today` on the current membership; 404 if none. |

## Code

- `domain/dancer.rs`: `DancerSource` (with `self` ↔ `SelfCreated`), `Dancer`, `can_edit`, `DancerFields`, `DancerSummary`.
- `domain/crew.rs`: `Crew`, `CrewRef`, `Member`, `CrewFields`.
- `domain/battle.rs`: the six battle/entry/staff Postgres enums. Needed now by `dancers/{id}/events`; M7 adds the rules.
- `domain/mod.rs`: `country_code` (moved from `event.rs`) and `instagram_handle` validators shared by events, dancers, crews.
- `db/mod.rs`: `contains_pattern` escapes `ilike` wildcards.
- Search lists (`dancers`, `crews`) use offset cursors (the cursor is the count already returned), since their ranking has no natural keyset. Events keep the `(starts_on, id)` keyset. `page::invalid_cursor()` and `page::offset()` are shared.
- Text is trimmed and blanks become null in SQL, as in M5. Handles are normalised in SQL: `nullif(lower(ltrim(btrim(h), '@')), '')`.

## Tests

- Unit (+5): handle shapes, `can_edit`, source by role, `contains_pattern`.
- `tests/dancers.rs` (8): create + normalisation + source per role, handle uniqueness vs. duplicate names, validation fields, search (notable first, alias in Hangul, `@handle`, second flag, literal `_`, deleted hidden, paging), `can_edit` per caller, edit rights before/after verification, delete rights + soft delete, participations split/ordered/roles/scope with drafts excluded.
- `tests/crews.rs` (4): organizer-only writes + normalisation + soft delete, name search, membership add/duplicate/profile/leave/rejoin, unknown dancer.
- `tests/test_app`: `set_role`.

## Verified locally

- `cargo fmt --check`, clippy (online and offline), `cargo test` (71 tests), `cargo sqlx prepare --check -- --all-targets`, `npm test`, `docker build` — pass.
- Real binary + seed on a scratch DB: `q=kid` returns *Kid Rocket* (`@kidrocket_bj`, Floor Lords) before *Kid Rockett*; Sensei Kai's profile shows aliases and Seoul Riders since 2008; crew search works.

## Known gaps

- Merged dancers (`merged_into_id`) are hidden from search, but `GET /dancers/{id}` still serves them. The `{ "merged_into": uuid }` response comes with the merge itself in M7b.
- A dancer who left a crew with an unknown join date can't rejoin it with an unknown date again: `unique nulls not distinct (dancer_id, crew_id, since)` → 409. Rare; giving a date works.
- Any `organizer` can edit or delete any crew, per §5 "Crew write: organizer+". Worth tightening (e.g. delete → `seed_admin`+) if vandalism appears.
- Bad path/query values still get axum's plain-text 400 (noted in M5).
