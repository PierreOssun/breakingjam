# Milestone 7 — Battles, entries, staff

Build order point 7 of `ARCHITECTURE.md` §11.

## Routes (`backend/src/api/battles.rs`)

Reads follow the jam's visibility (drafts: writers only, else 404). Writes need the jam's writers (owner or `seed_admin`+): 404 if the jam is invisible, 403 if read-only.

| Route | Result |
|---|---|
| `GET /api/events/{id}/battles` | Battles by `position`. |
| `POST /api/events/{id}/battles` | 201, appended at the end. A blank `name` is generated from the structured fields: "1v1 Bboy", "2v2 Mixed Kids", "Seven to Smoke Bgirl", "1v1 Mixed Masters" (adult with `age_min ≥ 40`). |
| `PUT /api/battles/{id}` | Replaces the fields (not the position). |
| `DELETE /api/battles/{id}` | 204; entries go with it (cascade). |
| `PUT /api/events/{id}/battles/order` `[battle_id, …]` | Every battle of the jam exactly once, else 422. Returns the reordered list. |
| `GET /api/battles/{id}/entries` | Entries oldest first, each with `crew {id, name}` and `members [{id, dancer_name, country, country2, instagram_handle}]`. |
| `POST /api/battles/{id}/entries` | `{team_name?, crew_id?, dancer_ids, status?, reached?, final_rank?, video_url?, video_offset_seconds?}`. Results may be set at creation (historical jams). |
| `PUT /api/entries/{id}` | Same body, full replace including members. Includes `team_name` and `crew_id` as well as the fields §5 lists, so typos can be fixed. |
| `DELETE /api/entries/{id}` | 204. |
| `GET /api/events/{id}/staff` | `[{role, dancer}]` by role (judge, dj, mc, organizer, other) then name. |
| `PUT /api/events/{id}/staff` `[{dancer_id, role}, …]` | Replaces the whole list; `[]` clears it. |

## Rules (`backend/src/domain/battle.rs`)

- **Battle checks mirror the §4 schema**, so they answer 422 with a field instead of a DB error: `team_size` required for team and forbidden otherwise; kids need `age_max ≤ 17`, adults `age_min ≥ 18`; `age_max ≥ age_min`; `bracket_size ∈ {2,4,8,…,64}`.
- **Entries (§4 "enforced in domain code")**:
  - 1–10 distinct dancers, all live (not deleted, not merged).
  - Seven-to-smoke: exactly one dancer.
  - Team: never more than `team_size`; exactly `team_size` once `confirmed`.
  - A dancer is in at most one non-withdrawn entry per battle (409).
  - `max_entries` counts non-withdrawn entries (409 "battle is full").
  - `crew_id` must be a live crew.
- **Results**: `final_rank` is filled from `reached` when absent (`winner` → 1, `top2` → 2); then `winner ⇔ final_rank = 1` and `top2 ⇒ final_rank = 2` are checked.
- **Video (§6)**: only YouTube `watch?v=`, `youtu.be/`, `/live/` links with an 11-char id; stored canonical as `https://www.youtube.com/watch?v=<id>`. The offset needs a URL.
- Safety net in `error.rs`: Postgres check and foreign-key violations now map to 422 (field = constraint name) instead of 500.
- `AppError::check(Vec<(field, message)>)` replaces the per-handler conversion from M5.

## Tests

- Unit (+5): default names, battle checks, entry member counts, reached/final_rank, YouTube parsing (incl. a `javascript:` trick).
- `tests/battles.rs` (9): names and positions, rule 422s, visibility + rights, reorder, one-entry-per-dancer + team size + unknown dancer, max entries, results + canonical video + dancer page showing the result, cascade delete, staff replace/duplicates/unknown/clear/rights.

## New crate

- `chore: add url` — parses YouTube links (§6). Already in the tree through oauth2, so no new code is compiled.
