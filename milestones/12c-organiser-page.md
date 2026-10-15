# Milestone 12c — Organiser page, verified by Instagram

Build order point 12c of `ARCHITECTURE_v0.1.md` §11: "Organiser should have a page like a dancer page (without battles) so he can verify with insta as well".

## Decision (asked at the start)

- **The organiser profile lives on the account.** `display_name` was already "shown on the jams you organise". Verification uses the same code and admin review as dancers, in the same admin screen. The jam page gets DESIGN's organiser card. Recorded in ARCHITECTURE §1, §4 ("Organiser identity"), §5 and §6.
- Migration, as approved:

  ```sql
  alter table app_users
    add column instagram_handle text,  -- lowercase, no '@'
    add column country char(2),
    add column city text,
    add column bio text,
    add column verified_at timestamptz;
  create unique index app_users_instagram_handle_key
    on app_users (lower(instagram_handle))
    where instagram_handle is not null;

  create table organizer_claims (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    instagram_handle text not null, -- frozen at request
    code text not null,             -- 'BJ-7K2M'
    status claim_status not null default 'pending',
    reviewed_by uuid references app_users(id),
    reviewed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create unique index organizer_claims_one_pending_key
    on organizer_claims (user_id)
    where status = 'pending';
  ```

## Backend (`domain/organizer.rs`, `db/organizers.rs`, `api/organizers.rs`)

| Route | Who | Result |
|---|---|---|
| `GET /api/organizers/{id}` | anyone | The page: name, handle, country, city, bio, `verified_at`, `can_edit`. Never the email or role. 404 for accounts that never registered a jam (below `organizer`). |
| `PUT /api/organizers/{id}` | the organiser | Replaces the page. The name is the account's `display_name`; the handle is stored lower case without `@` and is unique (409). |
| `GET /api/organizers/{id}/events` | anyone | Public jams (drafts left out): `upcoming` soonest first, `past` most recent first, cancelled included. |
| `POST /api/organizers/{id}/claim` | the organiser | A code for the **current** handle; repeating returns the pending one. 422 without a handle, 409 when already verified. |
| `GET /api/organizers/{id}/claim` | the organiser | The latest claim. |
| `GET /api/admin/organizer-claims` | admin | The queue, with the claim and who asked. |
| `POST /api/admin/organizer-claims/{id}/approve \| reject` | admin | Approve ticks the organiser **only if the handle is still the claimed one** (409 otherwise). |

- **The tick belongs to the handle, not the account:** changing the handle clears `verified_at` and rejects the pending claim on the old one. This differs from dancers on purpose: there, verification binds a page to an account.
- `GET /api/events/{id}` adds `organizer {id, display_name, instagram_handle, verified}` for the jam page.

## Frontend

- **`/organizers/:id`:**
  - The identity card (generalised from the dancer page): a pixel avatar seeded by the account id, name, tick, country chip, Instagram and the page URL. Then city and bio.
  - Then **Upcoming** and **Past** as jam rows with status badges. No battles, results or stats.
- **The owner's actions:**
  - **Add Instagram**, with why ("dancers see that the jam is really yours").
  - **Verify Instagram**: the same modal and pending pill as dancers, moved to `features/verify/`.
  - **Edit page**: name, handle (with a notice that a new handle loses the tick), country, city, bio.
- **Jam page:** an **Organiser** section with the name (linking to the page), the tick, and **Contact**, an Instagram DM link (`ig.me/m/<handle>`). Writers also get **Edit jam** at the top.
- `/org/jams` links to **Your organiser page**. `/admin/claims` shows **Dancers** and **Organisers** queues with one row component.

## Visual check (Chrome)

- **Organiser:** "Floor Lords e.V." added @floor.lords, opened the verify modal (code BJ-…), got the pending pill, and saw the organiser card and **Contact** on the jam page.
- **Admin:** the admin approved the organiser claim; the page then showed the tick (checked in the light theme too).
- **Bug:** the dialog-reset bug in the M12 note first showed up here (a typed handle that was then lost).

## Tests

- **Backend +4 (`tests/organizers.rs`):**
  - Page and events (drafts hidden until published; jam page names its organiser; no page without jams; email never public).
  - Edit rights, normalisation, taken handle (409), invalid fields.
  - Claim → queue → approve → tick, then a new handle drops it.
  - A handle changed during review can't be approved, and a fresh claim targets the new handle.
- **Frontend +4:** the page with jams and statuses; add handle then verify then pending; not found; the organiser queue's approve. The jam page test now checks the organiser card and the absent **Edit jam** link.

## Not built

- An organiser page has no stats, battles or results (by the brief).
- Organisers can't be merged.
- A team can't share one organiser page (an "organisation" entity was the other option, not chosen).
