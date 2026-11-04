# Pre-production hardening (M26)

A review of the schema and the API before the first production deploy (2026-11-04) found no need for a rework: the tables still fit the scope, the URLs stay shallow, the server owns the rules. It found a short list of changes that get dearer once real data exists, a few races and leaks, and docs that drifted. Agreed with the author on 2026-11-04.

## Decisions

- **Crew writes are the team's.** Editing or deleting a crew and adding or ending a membership need `seed_admin`+. A first draft makes any account an organiser, so `organizer`+ meant "anyone". Creating a crew stays `organizer`+ (the entry sheet's crew picker).
- **A jam's phase comes from its dates, not its status.** In the jam's own timezone:
  - **upcoming**: it starts after today;
  - **live**: today is one of its days;
  - **past**: it ended before today.

  One SQL function, `jam_phase(starts_on, ends_on, timezone)`, says it for every query, and the API returns `phase` wherever a jam is listed. A timezone Postgres doesn't know is refused on save (422 `timezone`), so the function never fails on a stored jam.
- **`completed` is gone.** It was a manual step that nobody needed: results, the dancer pages and the map already went by date. `registration_closed` stays. A jam shows its results once it is past.
- **Live now** is a group of its own: first on the dancer and organiser pages, a badge on cards and lists, on the map and on `/jams` with the upcoming jams. The landing's "Coming up" counts live and upcoming battles together, so its two counts still add up to every public jam.
- **A public jam that is past is locked for its organiser.**
  - Locked: its fields and dates, the flyer, the lineup, status changes (cancel included) and deleting it.
  - Still open: its battles and their entries, results and videos.
  - A draft or a jam in review is never locked, so a stale draft can still be moved.
  - `seed_admin`+ are never locked, so the team can still fix history.
  - The jam page gets `can_edit` (the details), `can_edit_battles` and `actions` (the status changes the caller may make now), all from the server; the frontend no longer keeps its own copy of the status graph.
- **The schema holds the rules the code already claims:**
  - winner ⇔ rank 1, and top 2 ⇒ rank 2;
  - a video offset needs a video;
  - a currency exactly when there is a prize;
  - a team size only for team battles and showcases;
  - a pin is both coordinates or neither.

  The curated-data import validates entries like the API does.
- **An Instagram handle is reserved by verification, not by typing it.** An organiser's unverified handle no longer blocks anyone. Approval then refuses a handle another verified account holds (409).
- **`dancers.real_name` is dropped**: never set, never shown, and a legal name on a public endpoint.
- **Indexes for the foreign keys the pages read by**: `entry_members(dancer_id)`, `event_staff(dancer_id)`, `events(organizer_id)`, and the account's own page (`dancers(created_by) where source = 'self'`).
- **One more migration, no squash.** Squashing the 15 migrations was considered, but UAT already runs them, and a squash would need a manual reset there (database, grants, seed, places). A 16th migration costs nothing at runtime. It rebuilds `event_status` without `completed`, turning UAT's completed jams into published ones. An applied migration is never edited.
- **Jam page in three calls:** `GET /events/{id}/battles` carries each battle's entries, and `GET /battles/{id}/entries` is gone.
- **Every bad path or query parameter is an `AppError`:** an unparsable id is 404 and a bad query is 422 with its field, never axum's plain-text 400.
- **Writes that read the jam lock it first.** These are battle create and update, and jam update. A battle's day check and the 32-battle cap can then no longer race a change of dates.
- **Merge:**
  - It no longer fails when both dancers are current members of the same crew.
  - It refuses (409, naming the battle) to leave one dancer in two active entries of a battle.
  - Adding a crew member and opening a claim take the merge lock like every other writer.
- **The checklist holds past draft:** deleting a jam's last battle is refused once it is submitted (422 `battles`), and approving runs the checklist again.
- **Unused surface goes:** the `country`, `from` and `to` filters of `GET /events`, and `?scope=` on `GET /dancers/{id}/events`.
- **Not in M26:** dropping the dancer indexes no query uses (`lower(dancer_name)`, `gin(aliases)`, `country`) and `events(country)`. That waits for the Find someone country filter, which decides what to index.

## Steps

1. Schema: migration `20261104000000_pre_prod_hardening` with the changes above. The seeded data passes every new check.
2. API:
   - crew roles;
   - `phase`, the lock and the capability flags, with `completed` removed;
   - the timezone check;
   - entries inside battles;
   - the Path and Query extractors;
   - the jam locks;
   - the merge fixes and the merge lock;
   - the checklist after submit;
   - the unused filters;
   - the importer check;
   - `openapi.json`.
3. Frontend:
   - Live now groups and badges;
   - status actions from the server;
   - the locked jam: no editor, battles still editable on the jam page;
   - results by phase;
   - entries from the battles;
   - one `storeJam` for the jam cache;
   - the 400 workarounds removed;
   - "This is me" hidden from an account that already has a page.
4. Docs: ARCHITECTURE.md §4 points at the init migration and keeps the notes, and the routes, statuses and roles are brought up to date.

## After review (2026-11-04, before the first push)

A five-angle review, each finding checked by a skeptic, and a UAT rehearsal found these. Each is fixed and tested.

- **Reordering battles** answered battles without their entries into the jam page's cache, which then crashed. Now it answers like `GET /events/{id}/battles`.
- **The import** had started to drop 25 curated results: teams known by name only failed the API's team-size rule. It now checks only the result rules the schema holds, and imports what HEAD did (1,755 entries).
- **Entry queries** no longer join `crews`. The columns' nullability then no longer depends on the query plan, which had made `sqlx prepare --check` fail at random.
- **Status changes** run under the jam lock, so a battle deleted or a pin cleared at the same moment can't slip past the publish checklist.
- **No public jam moved into the past by its organiser:** one mistyped date would have locked them out of moving it back (422 `ends_on`). The editor also refreshes what its writer may do when a save changes the phase.
- **Battles of a locked jam:** each battle card on the jam page has Edit for its organiser, since the editor is closed to them. Adding, deleting and reordering such battles stay possible through the API only.
- **The last battle of a submitted jam** has no Delete in the editor.
- **Migration `20261104000001_known_timezones`:** a jam stored before M26 with a timezone Postgres doesn't know falls back to UTC. Otherwise `jam_phase` would fail every list it appears in.
- **UAT deploy window:** between `sqlx migrate run` and the new containers, the old API can't read `real_name` or `completed`, so some pages answer 500 for that minute. Production has no earlier version, so it is not affected.

