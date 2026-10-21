# Milestone 7b — Dancer identity: claims, admin review, `dancer_edits`, merge (avatar deferred)

Build order point 7b of `ARCHITECTURE.md` §11.

## Decisions (asked at the start, recorded in §1/§4/§5 of the architecture doc)

- **Avatar upload deferred** until R2 exists. `avatar_url` stays null, so the frontend shows generated avatars.
- **Edit rights**: an unverified dancer is edited only by its creator or by `seed_admin`/`admin`; no community edits. A verified dancer: its owner or `seed_admin`+ (unchanged from §4). Every change to an unverified dancer is written to `dancer_edits`.

## Routes

| Route | Who | Result |
|---|---|---|
| `POST /api/dancers/{id}/claim` | logged in | 200 + `{id, code, status: "pending", …}`. Repeating it returns the same pending claim. 409 if the dancer is verified or the user already owns a page (`dancers.user_id` is unique). 404 for deleted/merged dancers. |
| `GET /api/dancers/{id}/claim` | logged in | The caller's latest claim on that dancer, or 404. |
| `GET /api/admin/claims?status=pending&cursor&limit` | admin | Review queue, oldest first; each item has the claim plus `dancer {id, dancer_name, country, country2, instagram_handle}` and `user {id, email, display_name}`. |
| `POST /api/admin/claims/{id}/approve` | admin | Dancer gets `user_id` + `verified_at`; other pending claims on it are rejected. 409 if already reviewed, the dancer is already verified, or the user already owns a page. |
| `POST /api/admin/claims/{id}/reject` | admin | Rejected; the user may claim again. |
| `POST /api/admin/dancers/{id}/merge {into}` | admin | See below. Returns `{merged_into, aliases, instagram_handle}`. |
| `PUT /api/admin/users/{id}/role {role}` | admin | Not listed under 7b, but §5 has it and no other step does. 422 for your own role (keeps the last admin in). |

Claim codes: `BJ-` + 4 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O, 1/I/L), drawn from a v4 UUID's random bytes.

## Merge (§4)

In one transaction, rows locked in id order:
- `entry_members`, `event_staff`, `crew_memberships`, `dancer_claims` move to the survivor. Rows that would collide (same entry, same jam + role, same crew + since) stay with the loser and are deleted.
- Pending claims on the loser are rejected if the same user has one on the survivor, or if the survivor is already verified.
- `aliases` = survivor's + loser's + the loser's name, deduplicated case-insensitively, without the survivor's own name.
- The loser gets `merged_into_id`; earlier redirects to the loser are repointed (no chains). The survivor adopts the loser's handle only if it had none (the unique index ignores merged rows, so this works in the same transaction).
- **Refused (409)** when the loser is verified ("merge the other one into it") or either side is already merged. Into itself → 422.
- `GET /api/dancers/{merged id}` → 200 `{ "merged_into": uuid }` (§4's "301-style" body, without an HTTP redirect, so `fetch` doesn't silently follow it). Merged dancers are 404 for writes and claims, and hidden from search, crews and entry checks.

## Tests

- Unit (+3): claim code alphabet, `changes` diff, `merged_aliases`.
- `tests/identity.rs` (6): claim → queue → approve (competing claim rejected, ownership, `can_edit`, one page per account), reject then retry, `dancer_edits` rows for unverified edits only, full merge (entry + staff collision + crew + handle + aliases + redirect + search + 404 on edit + no double merge), verified loser refused, role changes.

## Verified locally (M7 + 7b together)

- `cargo fmt --check`, clippy (online and offline), `cargo test` (95 tests), `cargo sqlx prepare --check -- --all-targets`, `npm test`, `docker build` — pass.
- Real binary + seed on a scratch DB:
  - a new user claims *Ventus* → `BJ-YEG9` pending → the seeded admin approves → the page is verified and editable by its owner.
  - merging *Kid Rockett* into *Kid Rocket* → aliases `["Rocket", "Kid Rockett"]`, handle kept, the old id returns `{merged_into}`, search shows one dancer.

## Not built

- `POST /api/dancers/{id}/avatar` (deferred, needs R2).
- No endpoint lists `dancer_edits`; it's an audit log read in the DB for now.
