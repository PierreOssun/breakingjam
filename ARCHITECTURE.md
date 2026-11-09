# BreakingJam — Architecture

Domain: **breakingjam.com**. The central place for breaking jams: a world map of jams, jam registration for organisers, and a dancer/crew database behind it.

Vocabulary: in UI copy, i18n keys and product docs the word is **jam** (not "event", not "battle"). In code, DB and API paths the entity stays `event`/`events` to avoid a rename later; the mapping is 1:1.
This document is the source of truth for the project and evolves with it. Anything not listed under *Scope* is out of scope — do not build it, but do not block it either.

## 1. Scope

### In scope
- Public landing page: a title, a subtitle and one search for jams and people (`/search`), then the next jams near the visitor and the site's counts (M18). **Register a jam** (`/org/jams/new`; login required, back to it after logging in; a new account, by email or Google, goes through the welcome step and then to the home page instead, as it may not organise; from any other page it returns there) sits under the landing search, and in the menu sheets below `xl`. The map (`/map`) and the jam list (`/jams`) are the browse experiences.
- World map of published jams (MapLibre GL); clicking a point opens a popup → jam detail page.
- Jam (event) CRUD for authenticated organisers. An admin approves each organiser's jam before it goes public (M14).
- Jam editor (M24, replaces the form of M12): **Register a jam** asks for the name and the first day only, creates the draft and opens its page in edit mode (`/org/jams/{id}/edit`). Every part of the page is a block (dates, venue, battles, lineup, about, links) that saves as you type; empty blocks show "+ Add" to the organiser and nothing to visitors. A publish checklist (name, dates, city + map pin, at least one battle) gates **Publish**, which submits to review as before; the API refuses `submit` and `publish` until it is complete. Edits to a live jam go public at once, like the flyer. The organiser is the account (co-organisers and crews as organisers stay deferred). Decided Nov 2026, with the author: the venue block gets as-you-type suggestions from Photon (komoot's OpenStreetMap geocoder, which allows autocomplete; Nominatim does not), done in step 2, and the battle sheet becomes category and format chips over the existing fields (§4 Notes), done in step 3.
- Search near a place (M22): when a search names a city, `/search` shows the closest upcoming jams to it ("Near <Place>"), even where no jam is registered, from the GeoNames cities of 15,000+ people (CC BY 4.0) loaded into `places`.
- Jam flyer upload (M19): whoever may edit a jam uploads a flyer that replaces the generated one everywhere (jam page, cards, lists, map). The browser crops it to 4:5 and encodes it; it goes live at once, without review, and admins remove unsuitable ones (decided in M19). The generated flyer stays the fallback and the share image.
- Contact page (`/contact`): how to reach BreakingJam by email or Instagram, with topic cards as `mailto:` links that prefill a subject. No form and no backend.
- Team page (`/team`): the people who run BreakingJam (role, Instagram, their dancer page when they have one) and a last card asking for organisers, to the contact page. A static config in `frontend/src/content/team.ts`, not a table; it names each person's dancer by its `data/dancers.toml` key, found with `GET /api/dancers/by-key/{key}`. Linked from the footer and the Contact page.
- Admin area (`/admin`, M14): counts of jams, dancers, organisers and accounts with verification rates, the jams waiting for review, and the Instagram claims. One tab per tool, so new tools join as tabs.
- Dancer CRUD via the API, used inside the jam flows (search-before-create when adding entry members or staff).
- Dancer page (`/dancers/{id}`): name, crew(s), country flag(s), Instagram link, generated avatar, a stats strip (jams, countries, years active, podiums, from past jams; added in M10), and the dancer's jams split into **upcoming** and **past** (with the battle, the stage reached and, once the manager exists, the full result). Reached from a dancer on a jam page, or from **Find someone** (`/dancers`): a public search by name, alias or handle over everyone (bboys, bgirls, DJs, MCs, judges), notable dancers first (`GET /api/dancers`).
- Organiser page (`/organizers/{id}`, added in M12c): like a dancer page without battles: the organiser's name, Instagram, country, city, bio and public jams, upcoming and past. Organisers verify their Instagram handle with the same code-and-review flow as dancers. The jam page links to it from its organiser card, which is left out for jams the BreakingJam team entered (seed admins and admins list jams they don't run, such as the imported historical ones).
- Dancer identity: Instagram handle as the (optional) uniqueness key, "Verify me" claim flow with a code-in-bio check reviewed by an admin, edits on unverified dancers by their creator or a BreakingJam admin (logged in `dancer_edits`), admin merge. See §4 "Dancer identity".
- Welcome step (M25, `/welcome?next=…`): right after sign-up, by email or Google, "Are you on BreakingJam?" searches the account's name. Each match leads to its page, where "This is me" verifies it. **Create my page** appears once a search has run and makes the account's own page, unverified, one per account (`POST /api/dancers/mine`). **Skip** goes on to `next`. The account and the page stay separate: an account may never have a page, and the account menu's "Find my page" leads back here.
- "I'm a…" titles (M25): a page may say what its dancer does (Bboy, Bgirl, Breaker, DJ, MC, Judge; several, none by default). Only its verified owner and `seed_admin`+ set them, so BreakingJam never guesses anyone's gender or role. The page shows them under the name. One page type for everyone: the code keeps `dancers`, the UI says "people", "my page" and "stage name", never "dancer" for a DJ.
- Seed data: the curated past jams of `data/` with their dancers and crews, added to production by the **Import data** workflow (`data import`, owned by the team's `seed_admin` account), and well-known dancers entered by a `seed_admin` (see roles in §5).
- Crew CRUD and crew membership (dated).
- Battles per jam (1v1, 2v2 … 10v10, seven-to-smoke; bboy/bgirl/mixed; kids/adult) and entries (the organiser's record of the lineup and results; `pending` means the team isn't complete yet) with members and the stage reached.
- Jam phases (M26): a jam is **upcoming**, **live** (today is one of its days) or **past**, by its own calendar in its timezone, never by a status someone has to set. Live jams are a group of their own on the dancer and organiser pages and wear a "Live now" chip on cards. Once a public jam is past, its organiser can still record its battles, entries, results and videos, but no longer edit its details, flyer or lineup, change its status or delete it; the BreakingJam team (`seed_admin`+) still can, to fix history.
- Event staff (judges, DJ, MC).
- Auth: email + password, and Google OAuth. Session cookies. A password account logs in only once its email is confirmed with a 6-digit code mailed to it, and "Forgot password" mails the same kind of code (M27).
- UI in English, French, German (UI strings only — user content is stored as written).

### Deferred (do not build, keep the schema open for it)
- Live battle management: prelims scoring, seeding, judge decisions, live view. Matches exist since M29 (`battle_matches`: round, winner, loser, video), written by the curated import and entered by organisers in the battle sheet's Results step, from which the placings follow.
- Dancer merge tool (soft dedupe only for now).
- Payments / organiser billing.
- Instagram or Apple login.
- Native apps.
- **Video index (next direction, decided Oct 2026)**: BreakingJam is the index, not the studio. Every battle video that exists on YouTube gets attached to its bracket slot and shows on the jam page and both dancers' pages, via the official YouTube embed, never self-hosted. Organisers and logged-in users paste a URL with an optional timestamp; one livestream URL + per-battle offsets turns into "watch this battle" buttons. Keep the schema open now: `video_url text` + `video_offset_seconds int` on `entries` (now, cheap, organiser-filled) and later on `matches`; a `video_sources` table (channel name, URL) when the index grows. No DMCA/hosting machinery until video is self-hosted, which is not planned.
- A public crew directory or search page (crews render inline; dancers have Find someone).
- Win/loss records on the dancer page (needs the battle manager); for now the page shows participation and `final_rank` when an organiser filled it in.
- Event list on the landing page.

## 2. Stack

| Layer | Choice |
|---|---|
| Backend | Rust (stable), axum, tokio, sqlx (Postgres, `runtime-tokio`, `tls-rustls`), serde, utoipa, tower-http, tracing |
| Database | PostgreSQL 17 |
| Frontend | React 19, Vite, TypeScript (strict), TanStack Query, React Router 7 (chosen in M9; v8 needs Node ≥ 22.22), react-i18next |
| Map | `react-map-gl` in MapLibre mode, `maplibre-gl`, Protomaps vector tiles (`.pmtiles`), `@protomaps/basemaps` style (the successor of the deprecated `protomaps-themes-base`; M11) |
| Images | Generated jam flyer as SVG (DESIGN.md §4.24); Open Graph PNG rasterised with `resvg`, brand fonts embedded; uploaded flyers cropped and JPEG-encoded in the browser, stored on R2 (M19) |
| API contract | OpenAPI 3.1 generated by `utoipa`; TS client via `openapi-typescript` + `openapi-fetch` |
| Local dev | Docker Compose (Postgres) |
| CI | GitHub Actions |
| Deploy | Cloudflare Pages (frontend), Cloudflare Containers (API), Neon Postgres via Cloudflare Hyperdrive |

Pin crate and npm versions in lockfiles. Check axum's version-specific syntax (0.8 path params use `{id}`, not `:id`) before copying snippets.

## 3. Repository layout (monorepo)

```
breakingjam/
├── ARCHITECTURE.md
├── DESIGN.md                   # visual system, produced with Claude Design (see §6)
├── CONVENTIONS.md              # short, derived from this file
├── docker-compose.yml          # postgres:17
├── .github/workflows/ci.yml
├── backend/
│   ├── Cargo.toml
│   ├── Dockerfile
│   ├── .sqlx/                  # committed offline query data
│   ├── openapi.json            # committed OpenAPI snapshot, kept in sync by `cargo test`
│   ├── migrations/
│   ├── src/
│   │   ├── main.rs             # config, tracing, pool, router, serve
│   │   ├── config.rs           # env → Config
│   │   ├── error.rs            # AppError + IntoResponse
│   │   ├── state.rs            # AppState { pool, config, ... }
│   │   ├── openapi.rs          # utoipa ApiDoc: info, tags, session security scheme
│   │   ├── auth/               # password, google oauth, session extractor
│   │   ├── domain/             # types + invariants, no sqlx
│   │   │   ├── event.rs
│   │   │   ├── dancer.rs
│   │   │   ├── crew.rs
│   │   │   └── ...
│   │   ├── db/                 # sqlx queries, one module per aggregate
│   │   └── api/                # axum handlers + DTOs, one module per resource
│   └── tests/                  # integration tests (#[sqlx::test]); unit/ mirrors src/ (M13)
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── api/                # generated client (schema.d.ts) + wrappers
    │   ├── i18n/               # en.json fr.json de.json
    │   ├── routes/             # one file per page
    │   ├── components/
    │   ├── features/           # events/, dancers/, crews/, map/, auth/
    │   └── lib/
    ├── tests/                  # Vitest, mirroring src/ (M13)
    └── public/                 # _headers, robots.txt, logo icons and site.webmanifest (DESIGN.md §10)
├── deploy/                     # Cloudflare Worker, wrangler.jsonc, deploy guide (M13)
```

Single backend crate for now. Split into a Cargo workspace only when compile times or module boundaries hurt.

## 4. Data model

### Conventions
- Primary keys: `uuid` generated as **UUIDv7** by the application (`uuid` crate, `v7` feature). Postgres column type `uuid`.
- Table names: plural, snake_case. Column names: snake_case.
- Entity tables (users, dancers, crews, events, battles, entries, places): `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (maintained by the `set_updated_at` trigger, never set in code). Claims, sessions and `dancer_edits` have `created_at` only; join tables have neither.
- Migrations: `backend/migrations/` is the source of truth; the SQL below is a summary kept in step with it. An applied migration is never edited: add one.
- Soft delete: `deleted_at timestamptz null` on `events`, `dancers`, `crews` only. All public queries filter `deleted_at is null`, except a jam's entries and staff: a deleted dancer stays on past results by name, `deleted: true` and unlinked. They can stay on an entry or staff list that is saved again, but join no new one.
- Concurrency (`api/transaction.rs`): merges run alone. A merge takes the merge lock (a transaction-level advisory lock) exclusively; every other transaction that writes dancers or rows pointing at them (entry and staff saves, claim openings and reviews, crew member adds, dancer edits) takes it shared, through `transaction::begin`. Beyond that, a save locks the parent of what it replaces first (the battle for an entry; the jam for its staff, its battles, its own fields and its status changes, so a battle's start and the jam's days can't drift apart and the publish checklist holds when the status changes), then reads and checks the rows it keeps, so each save judges the list as it is and `max_entries` can't be overrun; a claim approval locks the dancer before its claims. A transaction Postgres aborts for a deadlock or a serialisation conflict runs once more (`transaction::retrying`).
- Enums: Postgres `enum` types, mirrored as Rust enums with `#[sqlx(type_name = "...", rename_all = "snake_case")]`.
- Timestamps in UTC. Event dates are calendar dates (`date`) with a separate `timezone` text column (IANA name).
- Coordinates: `lat double precision`, `lng double precision`. No PostGIS for now.

### Tables

```sql
create type user_role as enum ('user', 'organizer', 'seed_admin', 'admin');
create type dancer_source as enum ('seed', 'organizer', 'self');
create type dancer_title as enum ('bboy', 'bgirl', 'breaker', 'dj', 'mc', 'judge');   -- M25
create type claim_status as enum ('pending', 'approved', 'rejected');
create type event_status as enum ('draft', 'in_review', 'published', 'registration_closed', 'cancelled');   -- `completed` dropped in M26
create type jam_phase as enum ('upcoming', 'live', 'past');   -- M26, returned by the function below

-- Where a jam is in time, by its own calendar; every query asks this, so the rule lives once (M26).
-- The API refuses a timezone Postgres doesn't know (`pg_timezone_names`), so this never fails.
create function jam_phase(starts_on date, ends_on date, timezone text) returns jam_phase stable
  as $$ select case when ends_on < (now() at time zone timezone)::date then 'past'
                    when starts_on > (now() at time zone timezone)::date then 'upcoming'
                    else 'live' end $$;
create type entry_status as enum ('pending', 'confirmed', 'withdrawn');
create type staff_role as enum ('judge', 'dj', 'mc', 'organizer', 'other');

create table app_users (
  id uuid primary key,
  email citext not null unique,
  password_hash text,                 -- null when oauth-only
  google_sub text unique,             -- null when password-only
  display_name text not null,
  role user_role not null default 'user',
  email_verified_at timestamptz,
  -- the organiser page (M12c); public, unlike the columns above
  instagram_handle text,              -- lowercase, no '@'; unique when present
  country char(2),
  city text,
  bio text,
  verified_at timestamptz,            -- set when an admin confirms the handle; cleared when it changes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index app_users_instagram_handle_key        -- verification reserves a handle,
  on app_users (lower(instagram_handle)) where verified_at is not null;   -- typing it doesn't (M26)

create table sessions (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on sessions(user_id);

create type email_code_purpose as enum ('verify_email', 'reset_password');
create table email_codes (            -- M27: one live code per account and purpose
  user_id uuid not null references app_users(id) on delete cascade,
  purpose email_code_purpose not null,
  code text not null check (code ~ '^[0-9]{6}$'),   -- plain: a million values, 15 minutes
  attempts smallint not null default 0 check (attempts between 0 and 5),
  sent_at timestamptz not null default now(),       -- a new code waits a minute after it
  sends smallint not null default 1 check (sends between 1 and 10),   -- codes since day_started_at
  day_started_at timestamptz not null default now(),                  -- 10 a day at most
  expires_at timestamptz not null,
  primary key (user_id, purpose)
);

create table dancers (
  id uuid primary key,
  user_id uuid unique references app_users(id) on delete set null,  -- set only by an approved claim
  dancer_name text not null,          -- "Lil G" — NOT unique
  aliases text[] not null default '{}',   -- "Hongten", "홍텐"
  country char(2) not null,           -- ISO 3166-1 alpha-2, primary flag
  country2 char(2),                   -- optional second flag (dual nationality / based in)
  city text,
  bio text,
  instagram_handle text,              -- lowercase, no '@'; the identity key when present
  source dancer_source not null default 'organizer',
  notable boolean not null default false,   -- seeded well-known dancers: search ranking only, NO visible badge
  verified_at timestamptz,            -- set on approved claim
  data_key text unique,               -- its key in data/dancers.toml when the curated import wrote it
  avatar_url text,                    -- uploaded by a verified dancer; null = generated avatar
  avatar_parts text,                  -- the generated avatar's parts, e.g. 'h2-s1-c0-o3-e0-b1', '-d5' for details (M17); null = seeded from id (M12b)
  titles dancer_title[] not null default '{}',   -- "I'm a…" (M25), in the enum's order; set by the verified owner or seed_admin+
  merged_into_id uuid references dancers(id),   -- non-null = this row is a redirect
  created_by uuid references app_users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dancers (lower(dancer_name));   -- no query uses it yet; decided with the Find someone filters
create index on dancers using gin (aliases);
create index on dancers (country);
create unique index dancers_instagram_handle_key
  on dancers (lower(instagram_handle))
  where instagram_handle is not null and deleted_at is null and merged_into_id is null;
create unique index dancers_one_self_page                        -- M25: one page of its own per account,
  on dancers (created_by)                                          -- counted like `own_page` does: live,
  where source = 'self' and deleted_at is null and merged_into_id is null   -- not merged away, not someone
    and (user_id is null or user_id = created_by);                 -- else's (a merge is refused in the handler)
create index dancers_self_pages on dancers (created_by) where source = 'self';   -- `own_page` on every /auth/me

create table dancer_claims (
  id uuid primary key,
  dancer_id uuid not null references dancers(id),
  user_id uuid not null references app_users(id),
  code text not null,                 -- e.g. 'BJ-7K2M'; shown to the user, placed in IG bio or sent by DM
  status claim_status not null default 'pending',
  reviewed_by uuid references app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on dancer_claims (status, created_at);
create unique index dancer_claims_one_pending_key
  on dancer_claims (dancer_id, user_id) where status = 'pending';   -- one pending claim per (dancer, user)

create table organizer_claims (       -- M12c: an organiser verifying their Instagram handle
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  instagram_handle text not null,     -- frozen at request: approval confirms this handle only
  code text not null,
  status claim_status not null default 'pending',
  reviewed_by uuid references app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index organizer_claims_one_pending_key
  on organizer_claims (user_id) where status = 'pending';

create table dancer_edits (            -- audit log of every edit on unverified dancers
  id uuid primary key,
  dancer_id uuid not null references dancers(id),
  user_id uuid not null references app_users(id),
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index on dancer_edits (dancer_id, created_at);

create table crews (
  id uuid primary key,
  data_key text unique,               -- its key in data/crews.toml when the curated import wrote it
  name text not null,
  country char(2),
  city text,
  instagram_handle text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on crews (lower(name));

create table crew_memberships (
  dancer_id uuid not null references dancers(id) on delete cascade,
  crew_id uuid not null references crews(id) on delete cascade,
  since date,                          -- null = unknown
  until date,                          -- null = current member
  unique nulls not distinct (dancer_id, crew_id, since)   -- not a PK: PK columns are forced NOT NULL
);
create unique index crew_memberships_one_current on crew_memberships (dancer_id, crew_id) where until is null;

create table events (
  id uuid primary key,
  organizer_id uuid not null references app_users(id),
  name text not null,
  slug text not null unique,          -- generated from name + short id suffix
  description text,
  status event_status not null default 'draft',
  starts_on date not null,
  ends_on date not null,
  timezone text not null,             -- IANA, e.g. 'Europe/Zurich'
  opens_at time,                      -- the jam's own hours, wall-clock in its timezone; null = not announced (M24)
  closes_at time,
  venue_name text,
  address text,
  city text,                          -- null until the venue is set (M24); required to submit or publish
  country char(2),                    -- same
  lat double precision,
  lng double precision,
  registration_url text,              -- external link allowed for now
  instagram_url text,
  website_url text,                   -- the jam's own site, http(s) (M15)
  contact_email text,                 -- public: shown on the jam page as a mailto: link (M15)
  review_note text,                   -- why an admin sent it back to draft; cleared by the next status change (M14)
  flyer_url text,                     -- the uploaded 1080×1350 flyer on R2; null = the generated flyer (M19)
  flyer_card_url text,                -- the same at 540×675, for cards, lists and the map
  data_key text unique,               -- its file in data/events (e.g. red-bull-bc-one/2019) when the curated import wrote it
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  constraint events_pin_together check ((lat is null) = (lng is null)),
  constraint events_flyer_together check ((flyer_url is null) = (flyer_card_url is null))
);
create index on events (status, starts_on);
create index on events (country);
create index on events (organizer_id);

-- A battle is one competition inside a jam ("Outbreak 2025 — 1v1 Bboy Adult").
-- A jam has several battles; each battle has its own entries, bracket and results.
create type battle_format as enum ('team', 'seven_to_smoke', 'na', 'showcase');   -- showcase added in M24; na = not known
create type battle_gender as enum ('bboy', 'bgirl', 'mixed');   -- mixed = open to both
create type battle_age as enum ('kids', 'adult', 'na');
create type bracket_stage as enum ('prelims', 'top64', 'top32', 'top16', 'top8', 'top4', 'top2', 'winner', 'na');

create table battles (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  name text not null,                 -- display name, e.g. "1v1 Bboy", "Crew 5v5", "Seven to Smoke Bgirl"
  format battle_format not null default 'team',
  team_size smallint check (team_size between 1 and 10),   -- 1 = 1v1 … 10 = 10v10; null unless format = 'team', or 'showcase' with a size
  gender battle_gender not null default 'mixed',
  age battle_age not null default 'adult',
  age_min smallint check (age_min >= 0),   -- required for adult (18, or e.g. 40 for a masters battle); kids: optional lower bound (e.g. 8)
  age_max smallint check (age_max >= age_min),   -- required for kids (17); adult: null = no upper bound
  bracket_size smallint check (bracket_size in (2, 4, 8, 16, 32, 64)),   -- starting bracket after prelims; null = unknown
  max_entries int check (max_entries > 0),
  prize_currency char(3) check (prize_currency ~ '^[A-Z]{3}$'),   -- ISO 4217 (EUR, CHF, CNY…); set exactly when a prize is
  prize_first integer check (prize_first >= 0),     -- cash prizes per place, in whole units of prize_currency
  prize_second integer check (prize_second >= 0),
  prize_third integer check (prize_third >= 0),
  position smallint not null default 0,   -- display order on the jam page
  starts_at timestamp,                    -- wall-clock start in the jam's timezone, on one of its days (API-checked); null = not announced (M18)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (format <> 'team' or team_size is not null),
  check (age <> 'kids' or (age_max is not null and age_max <= 17)),
  check (age <> 'adult' or (age_min is not null and age_min >= 18)),
  constraint battles_team_size_format check (format in ('team', 'showcase') or team_size is null),
  constraint battles_prize_currency
    check ((prize_currency is null) = (coalesce(prize_first, prize_second, prize_third) is null))
);
create index on battles (event_id, position);

create table entries (
  id uuid primary key,
  battle_id uuid not null references battles(id) on delete cascade,
  crew_id uuid references crews(id),  -- optional: team represents a crew
  team_name text,                     -- null for 1v1
  status entry_status not null default 'pending',
  reached bracket_stage not null default 'na',   -- furthest stage this entry reached; 'winner' = 1st place
  final_rank int check (final_rank >= 1),        -- exact placement when known (1, 2, 3/4 ...); derived from `reached` when absent
  video_url text,                     -- YouTube URL of this entry's best/final battle; embed only, never hosted
  video_offset_seconds int check (video_offset_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entries_winner_is_first check ((reached = 'winner') = (final_rank is not distinct from 1)),
  constraint entries_top2_is_second check (reached <> 'top2' or final_rank = 2),
  constraint entries_offset_needs_video check (video_offset_seconds is null or video_url is not null)
);
create index on entries (battle_id);

create type match_round as enum ('top64', 'top32', 'top16', 'top8', 'top4', 'third', 'final');
create table battle_matches (           -- M29: who met whom; top4 is the semi-finals, third the small final
  id uuid primary key,
  battle_id uuid not null references battles(id) on delete cascade,
  round match_round not null,
  position smallint not null check (position >= 0),     -- order within its round
  winner_id uuid not null references entries(id) on delete cascade,
  loser_id uuid not null references entries(id) on delete cascade,
  video_url text,
  video_offset_seconds int check (video_offset_seconds >= 0),   -- only with a video
  created_at timestamptz not null default now(),
  check (winner_id <> loser_id),
  unique (battle_id, round, position)
);

create table entry_members (
  entry_id uuid not null references entries(id) on delete cascade,
  dancer_id uuid not null references dancers(id),
  primary key (entry_id, dancer_id)
);
create index on entry_members (dancer_id);

create table event_staff (
  event_id uuid not null references events(id) on delete cascade,
  dancer_id uuid not null references dancers(id),
  role staff_role not null,
  primary key (event_id, dancer_id, role)
);
create index on event_staff (dancer_id);

-- M22: GeoNames cities of 15,000+ people, loaded by `cargo run --bin data -- places` (data/places/).
create table places (
  id uuid primary key,
  geonames_id integer not null unique,
  name text not null,                 -- as GeoNames writes it, e.g. "Zürich"
  ascii_name text not null,
  country char(2) not null,
  lat double precision not null,
  lng double precision not null,
  population integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table place_names (            -- every name a place answers to, folded (no case, accents or punctuation)
  place_id uuid not null references places(id) on delete cascade,
  name text collate "C" not null,     -- "C": the key's index serves exact and prefix lookups
  own boolean not null default false, -- its name or ASCII name, not an alternate
  primary key (name, place_id)
);
create index on place_names (place_id); -- each import deletes the places, cascading here
```

Notes:
- `citext` requires `create extension if not exists citext;` in the first migration.
- The team-size, winner/rank, video-offset, prize-currency and pin rules are both validated in `domain::` (a 422 naming the field) and held by the checks above (M26), so the curated-data import and any later writer can't break them; the import also runs `EntryFields::errors_for`.
- `entry_members` row count must equal `battles.team_size` for a `confirmed` entry when `format = 'team'` (or a `showcase` with a size); for `seven_to_smoke` an entry is always one dancer — enforced in domain code, not DB.
- One dancer may appear in only one entry per battle — enforce in code for now.
- A jam holds at most 32 battles (`domain::battle::MAX_BATTLES`, checked when a battle is added); every flyer lists them all.
- `reached` vs `final_rank`: `reached` is what organisers actually know the night of the jam ("he went out in top 8"); `final_rank` is set when there is a real placement (1st, 2nd, and 3rd/4th when a small final is held). The dancer page shows `final_rank` as "1st/2nd/3rd" when set, otherwise `reached` as "Top 8" / "Prelims". Rule: `reached = 'winner'` ⇔ `final_rank = 1`; `reached = 'top2'` ⇒ `final_rank = 2`.
- `battles.name` is free text so organisers keep their own wording; the structured fields (`format`, `team_size`, `gender`, `age`) are what search, filters and dancer stats use. The UI pre-fills `name` from the structured fields ("1v1 Bboy", "2v2 Mixed Kids", "Seven to Smoke Bgirl") and lets the organiser override it.
- Age presets in the UI: Kids (8–17, editable lower bound), Adult (18+), Masters (40+). Stored as `age` + `age_min`/`age_max`.
- The battle sheet's chips (M24) are presets over these fields, never a column of their own (`features/jams/battleFields.ts`):
  - Category: 1v1 Bboy, 1v1 Bgirl, 1v1 Open, 2v2, Crew (3v3 until a size is chosen), Kids (1v1 Open, 8–17), and Footwork and Powermove (1v1 Open battles named "1v1 Footwork" and "1v1 Powermove").
  - Format: Top 8, 16 and 32 (that bracket), 7 to Smoke (always solo: the category row reads it as 1v1 and no size is sent, but the form keeps the size it found, so letting go of it gives back the crew battle or the battle of unknown size it was; 2v2 and Crew drop it), and Showcase (format `showcase`, which keeps the category's size or none, and no bracket). Showcase got a format of its own because `na` already marks imported crew battles of unknown size and can't hold a team size. A bracket chip leaves such a battle `na`; only a category chip gives it a size, and with it the `team` format.
  - Only Footwork and Powermove touch the name; format chips never do.
  - A chip is lit when picking it would change nothing. A naming chip reads a name that already says its word ("Winter Power Move"). The other chips take back only a name a chip gave, never a typed one.
  - The server stores the name it made for an unnamed battle, so a stored name equal to what the fields would give loads blank in the sheet and keeps following them.
  - What no chip says (3v3 Bgirl, Masters, Top 64, a custom name) is set under **More options**. Folded, its row still shows the name that will be saved and the battle's summary, so nothing hides; it opens by itself on a stored battle no category chip describes, and on a server refusal of one of its fields.

### Dancer identity

Principles: the Instagram handle is the identity key but may be absent; verification is a state on top of existence, not a different kind of dancer; no photo is ever required.

- **Uniqueness**: `instagram_handle` is unique when present (partial index above). `dancer_name` is not unique — search results always show `name · @handle · country · crew` so the right one can be picked.
- **Three origins**, one row shape: `seed` (entered by a `seed_admin` before launch, `notable = true`), `organizer` (created during jam registration via search-before-create), `self` (an account's own page, made through `POST /api/dancers/mine` whatever its role, one per account; M25). `notable` affects search ranking only; it is never shown in the UI.
- **The account's own page** (`me.dancer`, M25): the page an approved claim linked to the account, else the `self` page it made (or the page that was merged into), unless someone else owns that. A page made for oneself is unverified like any other until "This is me" is approved, so the account may edit it (as its creator) but not set its titles.
- **Verification ("Verify me")**:
  1. A logged-in user opens a dancer page and calls `POST /api/dancers/{id}/claim`. One pending claim per (dancer, user).
  2. The response carries a short code (`BJ-` + 4 chars, unambiguous alphabet). The UI tells them to put it in their Instagram bio or DM it to @breaking.jam (BreakingJam's account; @breakingjam was taken).
  3. An admin reviews the queue (`GET /api/admin/claims`), checks the Instagram profile manually, approves or rejects. No scraping of Instagram, ever.
  4. On approve: `dancers.user_id = claim.user_id`, `verified_at = now()`, other pending claims on that dancer are rejected, the code is invalid. The dancer can now edit their own page.
- **Edits** (decided in M7b): an *unverified* dancer may be edited only by its creator (usually the organiser who added it during jam registration) or by `seed_admin`/`admin`; every change is written to `dancer_edits`. There are no community edits. On a *verified* dancer only the owner, `seed_admin` or `admin` may edit. A handle change after verification does not touch `user_id` or `verified_at` — ownership is bound to the account, not the string. Anonymous visitors can never edit.
- **Avatar**: when `avatar_url` is null the frontend renders the generated pixel avatar of DESIGN.md §4.16, seeded by `dancer.id`; whoever may edit the dancer can choose its parts, stored in `avatar_parts` (decided in M12b). Flags are chips beside it, never drawn into it. Verified dancers may upload a picture (`POST /api/dancers/{id}/avatar`, image ≤ 2 MB, stored on R2) — **deferred** (decided in M7b); it can reuse the flyer upload's store and crop (M19). Instagram pictures are never fetched.
- **Merge**: `POST /api/admin/dancers/{id}/merge {into}` moves `entry_members`, `event_staff`, `crew_memberships`, `dancer_claims` to the survivor, unions `aliases`, keeps the survivor's handle (or adopts the loser's if the survivor had none), and sets `merged_into_id` on the loser. `GET /api/dancers/{id}` on a merged row returns `301`-style `{ "merged_into": uuid }`; the frontend redirects.

### Organiser identity (M12c)
- The organiser page is the account's public side: `display_name` (shown on their jams), and the `instagram_handle`, `country`, `city`, `bio` columns of `app_users`. Never the email or role. Only accounts that registered a jam (`organizer`+) have one; only its owner edits it.
- **Verification** is of the handle, not the account: the organiser opens a claim on their current handle (`BJ-` code, same review queue screen as dancers), and approval sets `verified_at` only if the handle is still the claimed one. Changing the handle clears `verified_at` and rejects the pending claim on the old one.
- **Verification reserves the handle, typing it doesn't** (M26): two unverified accounts may type the same handle, so nobody squats one; approving a claim on a handle another verified account holds is a 409.

### Event status transitions
```
draft → in_review → published → registration_closed                  (organisers)
draft → published                                                    (seed_admin+: no review)
in_review → draft                                                    (admin rejects, with a note)
any (except cancelled) → cancelled
```
Whether a jam is over is its dates' business, not its status' (M26 dropped `completed`): `phase` (`jam_phase`) says upcoming, live or past, and the jam page shows its results once it is past. A public jam (published, registration closed, cancelled) that is past is locked for its organiser: `PUT`, `DELETE`, the status changes, the flyer and the lineup answer 409, while its battles and entries stay open (the editor then sends them to the jam page, where each battle card has Edit and its entries their controls); drafts and jams in review never lock, and `seed_admin`+ never do. An organiser can't move a public jam into the past either (422 `ends_on`), as the lock would keep them from moving it back. `GET /events/{id}` says what the caller may do: `can_edit` (details), `can_edit_battles` and `actions` (the transitions allowed now, from `Event::actions`), so the frontend keeps no copy of this graph.
Transitions are explicit endpoints (`POST /events/{id}/submit` etc.), not a free `PATCH status`. `submit` and `publish` run the publish checklist (M24): a city, a country and a map pin, and at least one battle; else 422 with the fields `place` and `battles` (`domain::event::Event::missing`). Once past draft, `PUT /events/{id}` refuses to drop a city, country or pin the jam has, so the map, the organiser and dancer pages and the stats can count on them (a jam published without a pin before M24 keeps saving); a jam cancelled while still a draft is the one public jam that may lack them, which is why `EventRef.city` and `country` are nullable. Approval and rejection are the admins' (`POST /admin/events/{id}/approve | reject`), decided in M14: every organiser's jam is reviewed, while the BreakingJam team publishes its own directly. A jam in review is private like a draft, and its organiser can keep editing it; approval runs the checklist again, and deleting the last battle of a jam past draft is refused (422 `battles`, M26). Jams published before M14 stay public.

## 5. Backend

### Error handling
- `AppError` enum in `error.rs`: `NotFound`, `Validation(Vec<FieldError>)`, `Unauthorized`, `Forbidden`, `Conflict(String)`, `Internal(anyhow::Error)`.
- `impl IntoResponse for AppError` → JSON body `{ "error": { "code": "not_found", "message": "...", "fields": [...] } }` with the matching HTTP status. Internal errors are logged with `tracing::error!` and return a generic message.
- `From<sqlx::Error>` maps `RowNotFound` → `NotFound`, unique violations → `Conflict`, rest → `Internal`.

### Handlers
- One module per resource in `api/`, exposing `pub fn router() -> OpenApiRouter<AppState>`.
- Request bodies are `<Resource>Fields` in `domain/` (shared by POST and PUT, `Deserialize` + `validator::Validate`) or `<Action>Request` next to the handler; responses are the domain type or a `<Resource>Response`/`<Resource>Detail` next to the handler; all derive `utoipa::ToSchema`.
- Extractors (`api/extract.rs`): `Path`, `Query` and `ValidJson` replace axum's, so a path that doesn't parse is a 404 and a bad query or body a 422 in the error envelope, never a plain-text 400 (M26).
- Handlers are thin: validate → call `db::`/`domain::` → map to response. No SQL in handlers.
- Pagination: `?limit=` (default 50, max 200) and `?cursor=` (opaque, based on `(starts_on, id)` for events). Responses `{ "items": [...], "next_cursor": "..." | null }`.
- IDs in paths are `uuid`. Public event pages also resolve by `slug`.

### Auth
- Password hashing: `argon2` (Argon2id, default params) keyed with the site's pepper, `PASSWORD_PEPPER` (a Worker secret, never in the database; M27). The browser sends the plain password over HTTPS.
- Email codes (M27): 6 digits from the OS's secure generator, 15 minutes, 5 tries (each try counted in the same statement that compares, so parallel guesses can't skip the count), one new code a minute per account and purpose, and at most 10 a day (so 50 guesses a day, and no email flood). The email goes out in a background task, in the language the frontend sends (en, fr, de). Register does not log in: `POST /auth/email/verify` does. A reset also confirms the email, as the code proves who reads it. A code that confirms an email also unlinks a Google account linked before anyone proved the address (the reverse of `link_google`). Google sign-in needs no code.
- Sessions: `sessions` table, cookie `bj_session` (HttpOnly, Secure, SameSite=Lax, 30-day expiry, rolling). Session id is a UUIDv4 (random, not v7).
- Extractors: `CurrentUser` (required) and `MaybeUser` (optional). `RequireRole(Organizer)` helper. Roles are ordered `user < organizer < seed_admin < admin`; a check for a role passes for any higher role.
- Roles:
  - `user`: can claim a dancer, make their own page (one), edit the unverified dancers they created, set the titles of their verified page, see everything public.
  - `organizer`: everything above + create jams and manage their own jams (battles, entries, staff), submit them for review, create dancers/crews from within a jam (`POST /api/dancers` is `organizer`+; M25). A `user` who creates their first jam is promoted to `organizer` automatically (jams start as drafts), so one draft is enough to make pages for others: `organizer`+ keeps plain visitors out, not determined accounts. Once one of their public jams is past, only its battles stay theirs to edit (M26).
  - `seed_admin` ("breakingjam_admin_seed"): everything above + create and edit **any** jam, dancer or crew, including seeding the initial ~200 dancers and historical jams, editing jams that are over, and publish jams without review. Cannot review jams or claims, merge dancers or manage users.
  - `admin`: everything. Reviews jams and claims, merges dancers, changes roles, sees the overview counts.
- Google OAuth: authorization-code flow with PKCE via `oauth2` crate; on first login create `app_users` row with `google_sub`; on later logins match by `google_sub`, then by verified email.
- Authorization rules:
  - Event write: `organizer_id == user.id`, or `seed_admin`+.
  - Dancer write (unverified): its creator (`created_by`), or `seed_admin`+; logged in `dancer_edits`. Dancer write (verified): `dancer.user_id == user.id`, or `seed_admin`+.
  - Dancer create: `organizer`+ (from a jam), or `user` for their own page (`source = self`).
  - Crew create: `organizer`+ (from the entry sheet). Crew edit, delete and memberships: `seed_admin`+ (M26: a first draft makes any account an organiser, so `organizer`+ meant anyone; membership self-service later).
  - Jam review, claims review, merge, role changes, overview counts: `admin` only.

### Routes
```
GET    /api/health
GET    /api/openapi.json
GET    /api/docs                         (Swagger UI, dev only)

POST   /api/auth/register                {email, password, display_name, language}: 202 {email}, no session; mails a `verify_email` code (M27)
POST   /api/auth/login                   {email, password, language}: 403 `email_unverified` (and a new code) while the email is not confirmed
POST   /api/auth/email/verify            {email, code}: confirms the email, ends any other session and logs in; 422 on `code` when wrong, expired or spent
POST   /api/auth/email/resend            {email, language}: always 204; mails a code to an unconfirmed account, once a minute and 10 times a day
POST   /api/auth/password/forgot         {email, language}: always 204; mails a `reset_password` code to any account
POST   /api/auth/password/reset          {email, code, password}: sets the password, confirms the email, ends every session, logs in
POST   /api/auth/logout
GET    /api/auth/me                      {id, email, display_name, role, dancer}: dancer = the account's own page (§4 "Dancer identity": id, name, avatar, `verified`), null when it has none (M23, M25); login, `email/verify`, `password/reset` and role changes return the same
GET    /api/auth/google                  → redirect
GET    /api/auth/google/callback

GET    /api/stats                        public counts for the landing page: past battles, dancers, upcoming battles and their countries
GET    /api/geo                          {country}: the visitor's ISO 3166-1 alpha-2 country from the `cf-ipcountry` header (set by the Worker), null when unknown
GET    /api/places                       ?q=   {place: {name, country, lat, lng, population} | null}: the city a search names, case and accents aside; an exact name or alternate name first (own names before alternates), then a prefix; when several match, one with a public jam within about 25 km, then the most populated; no lookup under 3 letters, no prefix under 4 nor of a name more than twice as long; under 50,000 people only the place's own name finds it; codes like "ZRH" are no names (M22)

GET    /api/events                       ?status=&mine=&cursor=&limit=   (mine=true: caller's own jams incl. drafts, login required; M26 dropped the unused country, from and to)
GET    /api/events.geojson               published and registration_closed events with coordinates, as FeatureCollection (id, name, slug, starts_on, ends_on, status, phase, city, country, battles: names in display order, categories: what the map's chips match, flyer_card_url, has_videos: a battle of this live or past jam has a video, M28)
GET    /api/events/{id_or_slug}           + phase, can_edit, can_edit_battles, actions, organizer {id, display_name, instagram_handle, verified, jams: how many public jams} (M12, M12c, M21, M26)
GET    /api/events/{id_or_slug}/flyer.svg  ?compact=&lang=en|fr|de   generated 4:5 flyer to inline (DESIGN.md §4.24)
GET    /api/events/{id_or_slug}/og.png     ?lang=   1200×630 Open Graph image
GET    /api/events/{id_or_slug}/calendar.ics      "Add to calendar": one all-day event over the jam's days, its venue and page link (M21)
POST   /api/events                       logged in (promotes `user` → `organizer`); a name, the days and a timezone are enough for a draft (M24)
PUT    /api/events/{id}                  owner/seed_admin+; past draft the city, country and pin must stay, else 422 `place` (M24); a timezone Postgres doesn't know is 422; 409 once public and past, 422 `ends_on` when the organiser would move a public jam into the past (M26)
DELETE /api/events/{id}                  soft delete, owner/seed_admin+; 409 once public and past
POST   /api/events/{id}/submit | publish | close-registration | cancel   (publish: seed_admin+, skips review; submit and publish need the checklist, else 422; 409 once public and past)
POST   /api/events/{id}/flyer            multipart: flyer (1080×1350 JPEG ≤ 2 MB), card (540×675 JPEG ≤ 400 KB)   owner/seed_admin+, live at once (M19)
DELETE /api/events/{id}/flyer            back to the generated flyer; how admins take one down

PUT    /api/battles/{id}/matches         [{round, position, winner_id, loser_id, video_url?, video_offset_seconds?}]: replaces the battle's matches (M29), jam writer as for entries; 422 on `matches` unless both sides are the battle's non-withdrawn entries, each plays once a round, each battle has its own place in its round (0 to the round's battles − 1; battles 2k and 2k+1 feed battle k) and a knocked-out entry plays no later round (but a semi-final loser the small final); the placings they decide follow (each loser's stage, 1st/2nd/3rd/4th from the finals) with the video and start of each entry's last match
GET    /api/events/{id}/battles          ordered by position, each with its entries (members, crew, results) and its matches (round, winner, loser, video; M29), so the jam page loads in three calls (M26)
POST   /api/events/{id}/battles          {name?, format, team_size?, gender, age, age_min?, age_max?, bracket_size?, max_entries?, prize_currency?, prize_first?, prize_second?, prize_third?, starts_at?}
PUT    /api/battles/{id}
DELETE /api/battles/{id}                 422 `battles` for the last battle of a jam past draft
PUT    /api/events/{id}/battles/order    [battle_id, ...] → the battles with their entries, as GET

POST   /api/battles/{id}/entries         {team_name?, crew_id?, dancer_ids: [...]}
PUT    /api/entries/{id}                 status, reached, final_rank, video_url, video_offset_seconds, members
DELETE /api/entries/{id}

GET    /api/events/{id}/staff
PUT    /api/events/{id}/staff            replace full list; 409 once public and past

GET    /api/dancers                      ?q=&country=&cursor=&limit=   (q = ilike on dancer_name, aliases and instagram_handle; notable first)
GET    /api/dancers/{id}                 profile + current crews
GET    /api/dancers/by-key/{key}         the same, for the dancer the curated import wrote for `key` (data/dancers.toml): the same in every environment, unlike ids; the Team page links its people this way
GET    /api/dancers/{id}/events          {live, upcoming, past} — jams where the dancer is an entry member or staff; each item: event (id, name, slug, starts_on, ends_on, city, country, status, phase), battle (id, name, format, team_size, gender, age), role (competitor|judge|dj|mc…), entry status, reached, final_rank, video_url
POST   /api/dancers                      a page for someone else, organizer+; titles seed_admin+
POST   /api/dancers/mine                 the account's own page, unverified, source self; 409 when it has one (M25)
PUT    /api/dancers/{id}                 see authorization rules; writes dancer_edits when unverified; titles absent = kept, sent only by the verified owner or seed_admin+ (else 403); can_set_titles on the page says who
DELETE /api/dancers/{id}                 soft delete, seed_admin+
POST   /api/dancers/{id}/claim           logged-in user → {code, status: pending}
GET    /api/dancers/{id}/claim           current user's claim on this dancer, if any
                                         (claims carry others_pending: someone else asked too; M12b)
POST   /api/dancers/{id}/avatar          multipart image, owner only   (deferred)

GET    /api/admin/stats                  overview counts: jams by status, dancers and organisers (verified, with Instagram), accounts (new in 30 days), pending claims   admin
GET    /api/admin/events                 jams in review, soonest first, with their organiser   admin
POST   /api/admin/events/{id}/approve    in_review → published, if the checklist still holds (else 422)   admin
POST   /api/admin/events/{id}/reject     {note} in_review → draft   admin
GET    /api/admin/claims                 ?status=pending   admin
POST   /api/admin/claims/{id}/approve    admin
POST   /api/admin/claims/{id}/reject     admin
POST   /api/admin/dancers/{id}/merge     {into: uuid}      admin
PUT    /api/admin/users/{id}/role        admin

GET    /api/organizers/{id}              organiser page + can_edit; 404 below `organizer` (M12c)
PUT    /api/organizers/{id}              own page only
GET    /api/organizers/{id}/events       public jams, {live, upcoming, past}
POST   /api/organizers/{id}/claim        own page, needs a handle → {code, status: pending}
GET    /api/organizers/{id}/claim        own latest claim
GET    /api/admin/organizer-claims       ?status=pending   admin
POST   /api/admin/organizer-claims/{id}/approve | reject   admin

GET    /api/crews                        ?q=&cursor=&limit=
GET    /api/crews/{id}                   includes current members
POST   /api/crews                        organizer+
PUT    /api/crews/{id}                   seed_admin+ (M26)
DELETE /api/crews/{id}                   seed_admin+
POST   /api/crews/{id}/members           {dancer_id, since?}   seed_admin+
DELETE /api/crews/{id}/members/{dancer_id}   sets until = today   seed_admin+
```

### Config (env)
```
DATABASE_URL, APP_PORT (default 8080), APP_BASE_URL, FRONTEND_ORIGIN (CORS),
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL, RUST_LOG,
MEDIA_STORE_URL (where uploads are PUT and DELETEd: the Worker's R2 handler in production,
`just media` in development), MEDIA_PUBLIC_URL (where they are read: the bucket's domain)
```
Loaded via `dotenvy` + a `Config::from_env()` that fails fast with a clear message.

Frontend env (`frontend/.env`, all public, `VITE_` prefix): `VITE_API_URL` (empty = same origin), `VITE_PROTOMAPS_KEY`, `VITE_TILES_URL` (optional, see §6 Map). Both `.env` files are git-ignored; `.env.example` files are committed with placeholders.

### Observability
- `tracing` with `tracing-subscriber` (JSON in prod, pretty in dev), `tower_http::trace::TraceLayer` with request id.

### Migrations
- `sqlx migrate add <name>`; applied with `sqlx::migrate!()` at startup in dev, and via `sqlx migrate run` in CI/deploy.
- `cargo sqlx prepare` output in `backend/.sqlx` is committed; CI runs with `SQLX_OFFLINE=true`.

## 6. Frontend

- Vite + React + TS strict. ESLint + Prettier with defaults.
- Data fetching: TanStack Query only. No global state library. Auth state = `useQuery(['me'])`.
- API client: `openapi-typescript` generates `src/api/schema.d.ts` from `backend` OpenAPI (`npm run gen:api` fetches `http://localhost:8080/api/openapi.json`). Calls go through `openapi-fetch`.
- Routing: `/` (landing), `/map`, `/jams` (Find a jam, the list), `/jams/{slug}`, `/search` (jams and people), `/dancers` (Find someone), `/dancers/{id}`, `/contact`, `/login`, `/register`, `/welcome` (M25, after sign-up), `/org/jams` (organiser list), `/org/jams/new`, `/org/jams/{id}/edit`, `/organizers/{id}` (M12c), and for admins `/admin` (overview), `/admin/jams` (review), `/admin/claims` and `/admin/dancers/{id}/merge`. No `/crews` routes yet; crews render inline.
- Dancer page (`/dancers/{id}`): header (avatar, dancer name, one or two country flags, city, current crews, Instagram link, verified tick when `verified_at` is set, "Verify me" button for logged-in non-owners while unverified, "Edit" for whoever is allowed), then the lists of `GET /api/dancers/{id}/events` (fetched from the URL id, beside the page) — **Live now** (only when a jam runs today, M26), **Upcoming** (jams starting after today in their own timezone, link to `/jams/{slug}`) and **Past** (reverse chronological, with battle name, role, a result badge (`final_rank` as "1st/2nd/3rd", else `reached` as "Top 8"…), and the **▶ Video** pill when the entry has a `video_url`, DESIGN.md §4.37; M28). Empty states for each. This page is the seed of the "where does this bboy go / what did he do" feature; the only edit affordances are those in §4 "Dancer identity".
- Video embeds: the **▶ Video** pill on an entry (jam page Battles, dancer page past rows; DESIGN.md §4.37) opens a modal with the official YouTube iframe (`youtube-nocookie.com/embed/{id}?start={offset}&rel=0`). Only YouTube URLs are accepted, validated server-side (`youtube.com/watch`, `youtu.be`, `youtube.com/live`); the video id is parsed once on save. Nothing is ever downloaded or hosted.
- Landing page (`/`), in order (M18, DESIGN.md §6 Landing):
  - The hero: the title "Find your next jam" (the page's only `<h1>`), the subtitle, and the search, whose round J logo button hands the words to `/search?q=`.
  - **Next up near you**: up to six upcoming jams as grid cards. By the visitor's position when they already allowed it (or tap "change" to share it): the nearest, soonest first. Else by their country (`GET /api/geo`): that country's jams first, soonest first, then the nearest others measured from the centre of its box (§6 Map); with an unknown country, the soonest anywhere. Hidden when nothing is upcoming.
  - **BreakingJam so far**: from `GET /api/stats`, Past (battles, dancers) and Coming up (battles, countries), the latter linking to the map and hidden with no upcoming battle. Public jams count, cancelled ones don't; Coming up counts live and upcoming battles together, so both counts add up to every battle (M26).
  - Then the footer: the round logo, Contact and Instagram, on one row (wrapping below about 400px); the header holds the other links and the language (DESIGN.md §6).
  M10 decided "no data fetching on this page"; M15 reverses that at the author's request. The map preview and the For dancers and For organisers bands are gone since M18; the organisers' pitch moves to a future `/register` landing.
- Search (`/search?q=`): first "Near <Place>" when `GET /api/places` finds a city (M22, DESIGN.md §4.33): the 3 nearest upcoming jams within 500 km of it, by great-circle distance in the browser over the map's GeoJSON, on a static mini map, with "Open the map around <Place>" (`/map?lat=&lng=&fit=`). Then the jams the words match, matched in the browser like the map's search (name, city, country), upcoming first, up to 10 then "See all on the map" (`/map?q=`); and the people from `GET /api/dancers?q=`, paged. A section with nothing in it hides while another has results; with nothing anywhere, one empty state. A blank search shows the upcoming jams and the notable people.
- Find a jam (`/jams`): every jam from `GET /api/events.geojson` as a list, with the map's search and filter chips, upcoming first (past ones with the "Past jams" chip), 30 at a time. The search is kept in `?q=`.
- Header: Jam map, Find a jam, Find someone, then the language switch, and Log in or the avatar button. **Register a jam** sits under the landing search (Nov 2026) and in the menu sheets. The full bar shows from `xl`; below, logged out, a menu sheet holds the same items, and logged in, the avatar button opens the account menu as a top sheet that also holds the nav. The account menu (M23, DESIGN.md §4.34): my page, verified or waiting for its claim (or the welcome step to find or make it), My jams with its drafts (`GET /api/events?mine=true&status=draft`) once the account has registered a jam (role `organizer` and up), Admin for admins with what waits for review (`GET /api/admin/stats`), the Light / Dark / Auto theme (kept in `localStorage`, `data-theme` on `<html>`), Log out.
- Visual system: follow `DESIGN.md` (tokens, components, states). Tailwind v4: its tokens live in the `@theme` of `src/styles/index.css` (the default palette, type scale, radii and shadows are removed), and `src/styles/tokens.test.ts` fails when they drift from `DESIGN.md` §2; do not hard-code colours or spacing outside it. Where `DESIGN.md` differs from this file on scope or routes (8 languages, `/en/…` prefixes, a cookie, `/d/<slug>`), this file wins: EN/FR/DE, unprefixed routes, `localStorage`.
- Forms: `react-hook-form` + `zod`. Validation mirrors backend validators; backend remains authoritative.
- i18n: `react-i18next`, language detected from browser, switchable in header, persisted in `localStorage`. Keys namespaced by feature (`events.form.name`). All three JSON files must have identical key sets (add a test).
- Styling: Tailwind. Mobile-first; the map and landing page must work at 375px.
- Map:
  - `react-map-gl/maplibre` with an `@protomaps/basemaps` style recoloured to DESIGN.md §7 (dark by default, light follows the app theme), labels in the UI language, no sprite (no POI, shield or one-way icons). Glyphs come from `protomaps.github.io/basemaps-assets`.
  - MapLibre's worker is imported as a Vite `?url` asset and passed to `setWorkerUrl`: MapLibre 6 looks for it next to its own module, which Vite moves.
  - Tile source from env, two modes:
    - `VITE_TILES_URL` unset (default) → hosted Protomaps API: `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=${VITE_PROTOMAPS_KEY}`. The key is public; it is protected by the origin allowlist in the Protomaps dashboard (localhost:5173, localhost:8080, breakingjam.com, *.breakingjam.com).
    - `VITE_TILES_URL=pmtiles://https://tiles.breakingjam.com/world.pmtiles` → self-hosted extract on R2 via the `pmtiles` protocol (production, later).
  - Attribution: Protomaps + OpenStreetMap contributors, always visible (bottom-right), required by both licences.
  - Data source: `GET /api/events.geojson`. Cluster at low zoom (`cluster: true` on the GeoJSON source).
  - A link may ask for the first view: `?fit=west,south,east,north` frames that box, else `?lat=&lng=` centres there (M22, from "Open the map around <Place>").
  - Otherwise the first view: the visitor's country from `GET /api/geo`, framed by a bounding box from Natural Earth (main landmass and nearby islands, `features/map/countryBounds.ts`). A country without upcoming jams is widened to its three nearest jams; an unknown country frames every jam. In development, `DEV_COUNTRY` in `frontend/.env` stands in for Cloudflare.
  - Click a point → popup with name, dates, city → link to `/jams/{slug}`.
  - Filters and search (decided in M11), all client-side over the one GeoJSON download: **When** (this weekend, next 30 days, past jams; one at a time) and **battle categories** (1v1, 2v2, crews, 7 to smoke, bgirl, kids; any one matches), combined with AND. Search matches every word against name, city, country code and country name (accents ignored); Enter fits the map to the matches and opens the jam when there is one. Without a time filter the map shows live and upcoming jams; **Past jams** shows the ones whose `phase` is past, most recent first, and a search looks through both, so "red bull" finds every BC One. No Cancelled filter yet.
  - Container: `height: 100dvh` minus header, `touch-action: none`.
- Dancer picker (used in entry and staff editing): debounced search on `dancer_name` showing existing matches; "create new dancer" is only enabled after a search has run (search-before-create). The crew picker works the same way.
- Jam location (M24 step 2, replacing the Nominatim search of M12): the Venue block's **Find the place** field asks Photon (`photon.komoot.io`, OpenStreetMap data, attributed under the block) from the browser as you type, after 3 letters and a 300 ms pause, for 5 places in the UI language, biased to the pin when there is one; `features/jams/geocode.ts` reads each result into a venue name (named places only, never towns or streets), an address line, the city and the country code. Picking one fills those fields and drops the pin, replacing what an earlier pick filled in but never what was typed by hand; the pin is then dragged or the map tapped to the exact door. A pin dropped before any search asks Photon's `/reverse` once for the city and country, a new drop calling off the last. City and country show as a flag chip "Filled from the address" with Edit while they are what the search found, and as fields otherwise. A jam needs its city, country and pin to be submitted or published.
- On the jam page, every dancer (entries, staff) is a link chip with their avatar, to `/dancers/{id}`.
- Jam page v2 (M21, DESIGN.md §6 Jam detail): an inset flyer, the status badge and a countdown chip, the title, meta lines (date with the first battle's start, city, all prizes), a "Who's in" card, then Battles (entries as wrapping chip rows), Lineup, About, Info (phones), Venue (a static MapLibre mini map, loaded lazily, and Directions), Organiser and "More jams coming up". The primary action follows the jam's state (register, add to calendar, see results; none when cancelled), in a bar along the bottom on phones and a card under the flyer on desktop. Its logic is pure in `features/jams/jamDetail.ts`. Share sends "<Jam> · <date> · <City>" to the system sheet, else copies the link with a toast.
- Jam editor (M24, DESIGN.md §4.35 and §6 Jam editor): `/org/jams/new` opens the start sheet over the organiser's list (name, first day → `POST /api/events` → the editor). `/org/jams/{id}/edit` is the jam page in edit mode: a bar under the header (status badge, Saved / Saving… / Not saved, Preview to `/jams/{slug}`, Publish on desktop), Delete at the foot of a draft at every width, the flyer with a Generated / Upload flyer pill, the title with an Edit pill, date chips (the days, "+ Last day", "+ Times" or the hours) opening the Dates block, then the Venue, Battles, Lineup, About and Links blocks and the Organiser card. Edits go out as one `PUT` 800 ms after typing stops (`features/jams/useAutosave.ts`). A field the API would refuse (`jamFields.jamProblems`, mirroring `EventFields`) stays at its stored value in that `PUT`, so one bad link never holds back the rest; its block stays open on the error, and the bar's "Not saved · Fix" leads to it ("Retry" when no field is at fault). Leaving the page sends what waits, with a toast if it can't; closing the tab asks first. The editor is keyed by jam, so its copy never goes out under another jam's id. The checklist (`jamFields.checklist`) is a card under the flyer on desktop and a sticky "Publish · N left" bar on phones that opens it as a sheet; each missing item's "Add" opens its block. A blank last day means a one-day jam.
- Jam page facts (M15): dates, venue, then the optional website (its host as the label, e.g. "pariscypher.com", opening in a new tab), contact email (a `mailto:` link, public by the organiser's choice) and Instagram. The description is a short pitch of at most 200 characters (About). Each of these shows only when set; the dev seed fills them on its invented jams, the imported historical jams leave them empty.
- People are managed on the jam page, not in the editor: its organiser sees **Add a dancer** (or **Add a team**) under each battle, an add chip per lineup role (judge, DJ, MC, host, staff), and edit and delete on each entry and person, withdrawn entries included. `/org/jams/{id}/edit` keeps the status, details, flyer and battles (with their prizes).
- Flyer upload (M19, DESIGN.md §4.28): the editor's Flyer section takes a PNG or JPEG of at most 20 MB and at least 540×675 px, opens the crop dialog (fixed 4:5 frame; drag, pinch, slider, arrow keys; zoom stops when the crop holds 540 px; a warning under 900 px), then draws the crop on a canvas as two JPEGs (1080×1350 and 540×675, quality 0.85, lowered if over the API's limit) and uploads them. Re-encoding drops EXIF and GPS; JPEG rather than WebP because Safari can't encode WebP from a canvas. No crop library: `features/jams/flyerCrop.ts` holds the geometry. `JamFlyer` shows the upload when there is one (the full size on the jam page, the card size elsewhere), else the generated flyer. On the jam page, whoever may edit the jam (`can_edit`) gets the same controls under the flyer: Upload a flyer, or Replace flyer and Remove flyer.
- Generated avatars (decided in M12b, following DESIGN.md §4.16 rather than DiceBear): the pixel 2D-HD bust, a 32×32 sprite drawn in code (`features/dancers/avatarParts.ts`) from six parts (hair, skin, hair colour, hoodie, extra, backdrop) plus optional details (lash flicks, lip tint, hoops; M17) and rendered as inline SVG with crisp edges plus the glow and vignette layer. Parts are seeded from `dancer.id` (same id → same face, no network call) unless `avatar_parts` holds a choice made in the edit sheet. Entering a dancer nobody has drawn into a bgirl or bboy battle stores a fitting default look (`domain::dancer::default_look`, M17). The sprites are a first pass that an illustrator may redraw. Flags are separate chips next to the avatar, never drawn into it. Uploaded avatars (verified dancers) override the generated one. Organiser pages use the same bust, seeded by the account id.
- Admin screens (`/admin/*`, `/admin/dancers/{id}/merge`): minimal tables and forms, `admin` role only, no design polish required. `/admin` has a tab per tool (Overview, Jams, Claims) carrying the size of its queue; the account menu's **Admin** item leads there.

## 7. Testing

### Backend
- Integration tests in `backend/tests/` using `#[sqlx::test]` (fresh DB per test from migrations). `DATABASE_URL` points to the compose Postgres locally and a `postgres` service container in CI.
- Each resource gets: happy-path CRUD, auth/authz rejection, validation error shape, status transition guard.
- Domain logic (status transitions, team_size check, reached/final_rank consistency) unit-tested. Unit tests live in `backend/tests/unit/`, mirroring `src/`, compiled into the crate under `cfg(test)` from `lib.rs`; the private helpers they test are `pub(crate)`. Source files hold no tests (decided in M13).
- `tests/access.rs` sweeps every route documented in `openapi.json`: 401 without a session, 404 on an unknown id, 403 on someone else's resources and for non-admins, named field errors, garbled cursors.

### Frontend
- Vitest + Testing Library for components with logic (forms, search-before-create). No snapshot tests. Tests live in `frontend/tests/`, mirroring `src/` (M13).
- i18n key-parity test.

### CI (`.github/workflows/ci.yml`)
Jobs on PR and main:
1. `backend`: Postgres 17 service, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo sqlx prepare --check`.
2. `frontend`: `npm ci`, regenerate `src/api/schema.d.ts` from `backend/openapi.json` and fail on any diff, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## 8. Local development

```
docker compose up -d                  # postgres on 5432
cd backend && cp .env.example .env && sqlx database create && sqlx migrate run && cargo run
cd frontend && npm i && npm run gen:api && npm run dev   # vite proxies /api → :8080
cd deploy && npx wrangler dev -c wrangler.media.jsonc   # uploads: a local R2 bucket on :8788
```
`just dev` starts all three. `just places` loads the GeoNames cities into the local database (`just reset-db` does too).
Seed script: `cargo run --bin seed` inserts an `admin`, a `seed_admin` user ("BreakingJam Team") and an `organizer` ("Cypher Collective", with two jams waiting for review), then **imports the real past jams of `data/`** (Red Bull BC One, Battle of the Year, Outbreak Europe, Unbreakable…, owned by the `seed_admin`): every jam that passes `data check`, with its dancers, crews, staff and results, published (their dates say they are over; an entry breaking a result rule the schema holds is left out, as is a jam whose timezone Postgres doesn't know; teams known by name only keep their results); the rest is left out (`RUST_LOG=seed=debug` lists what and why). On top come invented upcoming jams with registrations, drafts and in-review jams, invented dancers (one pair of deliberate near-duplicates for merge testing, DJs and MCs) and 5 crews; a dancer of `data/` they name (Menno, Hong 10…) is the imported row. It refuses any database host other than localhost, except the one `SEED_ALLOW_HOST` names exactly (UAT's). The real ~200 notable dancers are entered by hand through the UI by a `seed_admin`, not by this script.

**Places** (`data/places/`, guide in its README): GeoNames `cities15000` (CC BY 4.0) trimmed to id, name, ASCII name, alternate names, country, coordinates and population, committed so imports never download. `cargo run --bin data -- places` replaces the `places` and `place_names` rows in one transaction; UAT and production run it with the **Import places** workflow.

**Curated data** (`data/`, guide in `data/README.md`): real jams and their results (Red Bull BC One World Finals first) as reviewed TOML files, the source of truth for those jams; the app shows them read-only and fixes are made in the files. `cargo run --bin data -- check` validates them in CI (brackets consistent, every dancer and crew known, codes and links well-formed); `draft-wikipedia` and `draft-youtube` (from a channel's battle videos, through the YouTube Data API) draft new editions for a human to review. Battles are 1v1 or team battles (2v2, crews) whose sides are a crew, a named team and/or members; dancers belong to zero or more crews, as in `crew_memberships`. Each dancer, jam and battle has a stable key. The import writes every dancer of `dancers.toml`, in a jam or not, storing each one's key in `dancers.data_key` (crews and jams likewise in `crews.data_key` and `events.data_key`), and every match of a bracket into `battle_matches` (M29), besides the placings it derives for `entries`.
- **`data import OWNER_EMAIL`** (Nov 2026) runs that import against `DATABASE_URL`, in one transaction, for UAT and production through the **Import data** workflow; the seed runs the same import. It adds only what no earlier run wrote, found by key: new jams, and the dancers and crews they need; a merged dancer's key leads to the page it went into. What is already in the database stays as the site left it, so **a fix to a jam already imported does not reach a database that has it**; it is made there through the site by the team, or by a later "refresh" step. The owner must be a `seed_admin` or `admin` account (the jams are past, so locked for an ordinary organiser), shown as their organiser: production uses a team account, "BreakingJam Team".

## 9. Deployment (built in M13; guide in `deploy/README.md`)

- **Targets**: production (`breakingjam.com`, branch `prod`) and UAT (`uat.breakingjam.com`, branch `uat`, the `env.uat` Worker `breakingjam-uat`). Same code, separate Neon projects, secrets and Google OAuth clients. UAT holds seeded demo data only, never production data; its Worker (`TEST_SITE`) marks every response noindex, disallows all in robots.txt and marks every page so the app shows a test-site banner until the visitor closes it (remembered per browser in `localStorage`), and Cloudflare Access can keep it private. `main` is the development branch and deploys nowhere.
- **Domain**: `breakingjam.com` on Cloudflare DNS. One Worker per target (`deploy/`) serves the site at the apex and the API same-origin under `/api/*` (session cookies stay first-party; no CORS in prod). `www` redirects to the apex with a zone Redirect Rule.
- **Frontend**: Workers static assets from `frontend/dist` with the SPA fallback, not Cloudflare Pages (Cloudflare's current recommendation; one Worker, one deploy). Built with `VITE_API_URL` empty (same origin). `frontend/public/_headers` sets CSP, HSTS and the immutable cache for `/assets/*`.
- **Visitor country**: the Worker sets `cf-ipcountry` on every `/api/*` request from `request.cf.country`, replacing any value the client sent; `GET /api/geo` reads it for the map's first view.
- **Open Graph**: the Worker runs first for `/jams/{slug}`, reads the jam from the API as an anonymous visitor (drafts stay hidden) and appends `og:*` tags to `index.html` with HTMLRewriter: the title "<Jam> · <Wed 4 Nov> · <City>", the battle names + "on BreakingJam" (read from `/api/events/{id}/battles`), and the uploaded flyer at card size, else `/api/events/{slug}/og.png` (M21).
- **API**: `backend/Dockerfile` (multi-stage, `cargo-chef`, distroless) runs as a Cloudflare Container (GA April 2026, Workers Paid plan). The Worker passes its vars and secrets to it as environment variables and spreads requests over `API_INSTANCES` instances. Instances sleep after 30 minutes idle and wake in 1–3 s. They run in western Europe, next to Neon: the Worker creates them with the location hint `weur`, and `wrangler.jsonc` limits the containers to the `WEUR` region. Without that, an instance stays wherever its first request came from (the first UAT one ran in Los Angeles, about 0.5 s per query). The Dockerfile stays generic.
- **DB**: Neon Postgres, reached **directly over TLS** with the API's own sqlx pool. Hyperdrive was the plan, but containers can't use it (cloudflare/containers#97, open as of October 2026). Migrations run from the deploy workflow with `sqlx migrate run` before the new containers roll out, so they must stay compatible with the API version still running. The API connects as `breakingjam_app` (rows only, no DDL); migrations use the owner role.
- **Releases**: commits move `main` → `uat` → `prod` by fast-forward pushes. A push to `uat` or `prod` starts `.github/workflows/deploy.yml` in the GitHub environment of the same name (`prod` needs a reviewer): the full CI, the frontend build, a Neon snapshot branch, the migrations, `wrangler deploy` (Worker, assets, image), then a `/api/health` check. `wrangler rollback` returns to the previous Worker version.
- **Backups**: the pre-deploy Neon branch (kept 7 days), Neon point-in-time restore, and a nightly `pg_dump` of production to R2 (`.github/workflows/backup.yml`, kept 30 days, read-only role `breakingjam_backup`).
- **Media** (M19): uploaded flyers live in an R2 bucket per target (`breakingjam-media`, `-uat`), served on its own domain (`media.breakingjam.com`, `media-uat.breakingjam.com`, both in the CSP's `img-src`). The API PUTs and DELETEs over plain HTTP to `media.internal`, a host the Worker intercepts (`Api.outboundByHost` with the exported `ContainerProxy`, `@cloudflare/containers` ≥ 0.2) and serves with its R2 binding: no R2 keys and no S3 signing in the API. Keys are new per upload (`flyers/{event}/{uuid}.jpg` and `-card.jpg`), cached a year as `immutable`. Replacing or removing a flyer, or deleting its jam, deletes the old objects in the background (so a dropped request can't skip it); the flyer replaced is read under the row's lock, so concurrent uploads never strand one.
- **Mail** (M27): the API POSTs `{to, subject, text}` to `mail.internal`, which the Worker intercepts like `media.internal` and sends with Cloudflare Email Service (`send_email` binding `EMAIL`, from `noreply@breakingjam.com` on both targets). No mail keys in the API. The service is in beta, needs Workers Paid, and sends to any address once `breakingjam.com` is onboarded (deploy/README.md). In development, `just media` prints the emails.
- **Tiles**: the hosted Protomaps API for now; later a `.pmtiles` extract on R2 via the pmtiles protocol (`VITE_TILES_URL`, plus its host in the CSP).
- Secrets via `wrangler secret put` (API) and GitHub environment secrets (deploy), never committed.

## 10. Conventions summary (copy to CONVENTIONS.md)

- Rust: `cargo fmt`, `clippy -D warnings`, `thiserror` for typed errors, `anyhow` only at boundaries, no `unwrap` outside tests, `tracing` not `println`.
- SQL: compile-time checked `sqlx::query!`/`query_as!` only; no string-built SQL.
- API: JSON snake_case, RFC 3339 timestamps, ISO 3166-1 alpha-2 countries, error envelope `{ "error": { code, message, fields? } }`.
- Git: trunk-based, PRs into `main`, conventional commits (`feat:`, `fix:`, `chore:`…).
- Versioning: release tags follow the `Cargo.toml` version and are cut when CI is green.
- Language: code, comments, commits and docs in English.

## 11. Suggested build order

1. Repo skeleton, compose, CI, `health` endpoint, Dockerfile.
2. Migrations (all tables), seed binary.
3. `AppError`, `AppState`, config, tracing.
4. Auth (register/login/logout/me, session extractor), then Google OAuth.
5. Events CRUD + status transitions + `events.geojson`.
6. Dancers CRUD + search + `dancers/{id}/events`; crews + memberships.
7. Battles, entries, staff.
7b. Dancer identity: claims, admin review, `dancer_edits`, merge, avatar upload.
8. utoipa doc for everything above; generate TS client.
9. Frontend shell: routing, i18n, auth pages, header with language switch; Tailwind config from `DESIGN.md` tokens.
10. Landing page (two CTAs), jam detail page, dancer page (upcoming / past jams).
11. Map page.
12. Organiser jam form; dancer/crew pickers with search-before-create inside entries and staff editing.
12b. Generated avatars, "Verify me" flow, dancer edit form, admin claims/merge screens.
12c. Organiser should have a page like a dancer page (without battles) so he can verify with insta as well
13. Integration test coverage pass, README, first release tag.
14. Admin area: jams reviewed before going public, overview counts, claims under the same tabs.
15. Jam contact email and website; landing page "Featured near you" and site counts.
24. Jam editor (M24): a) start sheet, editor page with blocks and autosave, publish checklist, nullable city/country, opening hours — done; b) venue block with Photon suggestions, map pin, city and country from the address — done; c) battle sheet with category and format chips, "Add battle" in one tap — done.
25. Welcome step (M25): "Are you on BreakingJam?" after sign-up (find and verify, create my page, skip), `me` returns the account's own page, one own page per account, "I'm a…" titles set by the verified owner or the team. Find someone filters (by title and country) are their own later step.
26. Pre-production hardening (M26): no `completed` status, jams upcoming, live or past by their own calendar (`jam_phase`), a public jam that is over locked but for its battles, the schema's checks and indexes, crew writes for the team, entries inside battles, server-side status actions, the merge fixes, docs brought up to date.
27. Email verification (M27): register mails a 6-digit code and logs in only once it is confirmed, "Forgot password" with the same codes, Cloudflare Email Service behind `mail.internal`, the password pepper. a) schema, API, Worker; b) frontend.
28. Video links (M28): the **▶ Video** pill on battle results (dancer page past rows, the jam's Battles), "Videos available" on the previews of jams with videos, which open at `#battles`; `has_videos` on `events.geojson`. Several videos per battle wait for match videos.
29. Battle results by round (M29): `battle_matches` (the final made from 1st vs 2nd for existing results), the import storing every curated match, the jam page by round (final card, crowned match cards, placings where pairings are unknown, rounds below Top 8 folded on phones). a) data, API, jam page — done; b) organisers enter matches (a "Results" step in the battle sheet) — done.

For Every suggested build order point, save it in milestones/ with a filename matching the build order point.