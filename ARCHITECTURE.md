# BreakingJam — Architecture

Domain: **breakingjam.com**. The central place for breaking jams: a world map of jams, jam registration for organisers, and a dancer/crew database behind it.

Vocabulary: in UI copy, i18n keys and product docs the word is **jam** (not "event", not "battle"). In code, DB and API paths the entity stays `event`/`events` to avoid a rename later; the mapping is 1:1.
This document is the source of truth for the project and evolves with it. Anything not listed under *Scope* is out of scope — do not build it, but do not block it either.

## 1. Scope

### In scope
- Public landing page: a title, a subtitle and one search for jams and people (`/search`), then the next jams near the visitor and the site's counts (M18). **Register a jam** (`/org/jams/new`; login required, redirect back after auth) is in the header on every page. The map (`/map`) and the jam list (`/jams`) are the browse experiences.
- World map of published jams (MapLibre GL); clicking a point opens a popup → jam detail page.
- Jam (event) CRUD for authenticated organisers. An admin approves each organiser's jam before it goes public (M14).
- Admin area (`/admin`, M14): counts of jams, dancers, organisers and accounts with verification rates, the jams waiting for review, and the Instagram claims. One tab per tool, so new tools join as tabs.
- Dancer CRUD via the API, used inside the jam flows (search-before-create when adding entry members or staff).
- Dancer page (`/dancers/{id}`): name, crew(s), country flag(s), Instagram link, generated avatar, a stats strip (jams, countries, years active, podiums, from past jams; added in M10), and the dancer's jams split into **upcoming** and **past** (with the battle, the stage reached and, once the manager exists, the full result). Reached from a dancer on a jam page, or from **Find someone** (`/dancers`): a public search by name, alias or handle over everyone (bboys, bgirls, DJs, MCs, judges), notable dancers first (`GET /api/dancers`).
- Organiser page (`/organizers/{id}`, added in M12c): like a dancer page without battles: the organiser's name, Instagram, country, city, bio and public jams, upcoming and past. Organisers verify their Instagram handle with the same code-and-review flow as dancers. The jam page links to it from its organiser card, which is left out for jams the BreakingJam team entered (seed admins and admins list jams they don't run, such as the imported historical ones).
- Dancer identity: Instagram handle as the (optional) uniqueness key, "Verify me" claim flow with a code-in-bio check reviewed by an admin, edits on unverified dancers by their creator or a BreakingJam admin (logged in `dancer_edits`), admin merge. See §4 "Dancer identity".
- Seed data: ~200 well-known dancers entered by a `seed_admin` user before launch (see roles in §5).
- Crew CRUD and crew membership (dated).
- Battles per jam (1v1, 2v2 … 10v10, seven-to-smoke; bboy/bgirl/mixed; kids/adult) and entries (registrations) with members and the stage reached.
- Event staff (judges, DJ, MC).
- Auth: email + password, and Google OAuth. Session cookies.
- UI in English, French, German (UI strings only — user content is stored as written).

### Deferred (do not build, keep the schema open for it)
- Live battle management: `rounds` and `matches` tables under `battles` (match = entry A vs entry B at a `bracket_stage`, with judge decisions and a `video_url`), prelims scoring, seeding, live view. For now the organiser only records `entries.reached` / `final_rank` by hand; the manager will compute them.
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
| Images | Generated jam flyer as SVG (DESIGN.md §4.24); Open Graph PNG rasterised with `resvg`, brand fonts embedded |
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
- Every table: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (maintained by the `set_updated_at` trigger, never set in code).
- Soft delete: `deleted_at timestamptz null` on `events`, `dancers`, `crews` only. All public queries filter `deleted_at is null`.
- Enums: Postgres `enum` types, mirrored as Rust enums with `#[sqlx(type_name = "...", rename_all = "snake_case")]`.
- Timestamps in UTC. Event dates are calendar dates (`date`) with a separate `timezone` text column (IANA name).
- Coordinates: `lat double precision`, `lng double precision`. No PostGIS for now.

### Tables

```sql
create type user_role as enum ('user', 'organizer', 'seed_admin', 'admin');
create type dancer_source as enum ('seed', 'organizer', 'self');
create type claim_status as enum ('pending', 'approved', 'rejected');
create type event_status as enum ('draft', 'in_review', 'published', 'registration_closed', 'completed', 'cancelled');
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
create unique index app_users_instagram_handle_key
  on app_users (lower(instagram_handle)) where instagram_handle is not null;

create table sessions (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on sessions(user_id);

create table dancers (
  id uuid primary key,
  user_id uuid unique references app_users(id) on delete set null,  -- set only by an approved claim
  dancer_name text not null,          -- "Lil G" — NOT unique
  aliases text[] not null default '{}',   -- "Hongten", "홍텐"
  real_name text,
  country char(2) not null,           -- ISO 3166-1 alpha-2, primary flag
  country2 char(2),                   -- optional second flag (dual nationality / based in)
  city text,
  bio text,
  instagram_handle text,              -- lowercase, no '@'; the identity key when present
  source dancer_source not null default 'organizer',
  notable boolean not null default false,   -- seeded well-known dancers: search ranking only, NO visible badge
  verified_at timestamptz,            -- set on approved claim
  avatar_url text,                    -- uploaded by a verified dancer; null = generated avatar
  avatar_parts text,                  -- the generated avatar's parts, e.g. 'h2-s1-c0-o3-e0-b1', '-d5' for details (M17); null = seeded from id (M12b)
  merged_into_id uuid references dancers(id),   -- non-null = this row is a redirect
  created_by uuid references app_users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dancers (lower(dancer_name));   -- search-before-create
create index on dancers using gin (aliases);
create index on dancers (country);
create unique index dancers_instagram_handle_key
  on dancers (lower(instagram_handle))
  where instagram_handle is not null and deleted_at is null and merged_into_id is null;

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
  venue_name text,
  address text,
  city text not null,
  country char(2) not null,
  lat double precision,
  lng double precision,
  registration_url text,              -- external link allowed for now
  instagram_url text,
  website_url text,                   -- the jam's own site, http(s) (M15)
  contact_email text,                 -- public: shown on the jam page as a mailto: link (M15)
  review_note text,                   -- why an admin sent it back to draft; cleared by the next status change (M14)
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on events (status, starts_on);
create index on events (country);

-- A battle is one competition inside a jam ("Outbreak 2025 — 1v1 Bboy Adult").
-- A jam has several battles; each battle has its own entries, bracket and results.
create type battle_format as enum ('team', 'seven_to_smoke', 'na');
create type battle_gender as enum ('bboy', 'bgirl', 'mixed');   -- mixed = open to both
create type battle_age as enum ('kids', 'adult', 'na');
create type bracket_stage as enum ('prelims', 'top64', 'top32', 'top16', 'top8', 'top4', 'top2', 'winner', 'na');

create table battles (
  id uuid primary key,
  event_id uuid not null references events(id) on delete cascade,
  name text not null,                 -- display name, e.g. "1v1 Bboy", "Crew 5v5", "Seven to Smoke Bgirl"
  format battle_format not null default 'team',
  team_size smallint check (team_size between 1 and 10),   -- 1 = 1v1 … 10 = 10v10; null unless format = 'team'
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
  check (age <> 'adult' or (age_min is not null and age_min >= 18))
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
  updated_at timestamptz not null default now()
);
create index on entries (battle_id);

create table entry_members (
  entry_id uuid not null references entries(id) on delete cascade,
  dancer_id uuid not null references dancers(id),
  primary key (entry_id, dancer_id)
);

create table event_staff (
  event_id uuid not null references events(id) on delete cascade,
  dancer_id uuid not null references dancers(id),
  role staff_role not null,
  primary key (event_id, dancer_id, role)
);
```

Notes:
- `citext` requires `create extension if not exists citext;` in the first migration.
- `entry_members` row count must equal `battles.team_size` for a `confirmed` entry when `format = 'team'`; for `seven_to_smoke` an entry is always one dancer — enforced in domain code, not DB.
- One dancer may appear in only one entry per battle — enforce in code for now.
- `reached` vs `final_rank`: `reached` is what organisers actually know the night of the jam ("he went out in top 8"); `final_rank` is set when there is a real placement (1st, 2nd, and 3rd/4th when a small final is held). The dancer page shows `final_rank` as "1st/2nd/3rd" when set, otherwise `reached` as "Top 8" / "Prelims". Rule: `reached = 'winner'` ⇔ `final_rank = 1`; `reached = 'top2'` ⇒ `final_rank = 2`.
- `battles.name` is free text so organisers keep their own wording; the structured fields (`format`, `team_size`, `gender`, `age`) are what search, filters and dancer stats use. The UI pre-fills `name` from the structured fields ("1v1 Bboy", "2v2 Mixed Kids", "Seven to Smoke Bgirl") and lets the organiser override it.
- Age presets in the UI: Kids (8–17, editable lower bound), Adult (18+), Masters (40+). Stored as `age` + `age_min`/`age_max`.

### Dancer identity

Principles: the Instagram handle is the identity key but may be absent; verification is a state on top of existence, not a different kind of dancer; no photo is ever required.

- **Uniqueness**: `instagram_handle` is unique when present (partial index above). `dancer_name` is not unique — search results always show `name · @handle · country · crew` so the right one can be picked.
- **Three origins**, one row shape: `seed` (entered by a `seed_admin` before launch, `notable = true`), `organizer` (created during jam registration via search-before-create), `self` (a logged-in user creating their own page). `notable` affects search ranking only; it is never shown in the UI.
- **Verification ("Verify me")**:
  1. A logged-in user opens a dancer page and calls `POST /api/dancers/{id}/claim`. One pending claim per (dancer, user).
  2. The response carries a short code (`BJ-` + 4 chars, unambiguous alphabet). The UI tells them to put it in their Instagram bio or DM it to @breaking.jam (BreakingJam's account; @breakingjam was taken).
  3. An admin reviews the queue (`GET /api/admin/claims`), checks the Instagram profile manually, approves or rejects. No scraping of Instagram, ever.
  4. On approve: `dancers.user_id = claim.user_id`, `verified_at = now()`, other pending claims on that dancer are rejected, the code is invalid. The dancer can now edit their own page.
- **Edits** (decided in M7b): an *unverified* dancer may be edited only by its creator (usually the organiser who added it during jam registration) or by `seed_admin`/`admin`; every change is written to `dancer_edits`. There are no community edits. On a *verified* dancer only the owner, `seed_admin` or `admin` may edit. A handle change after verification does not touch `user_id` or `verified_at` — ownership is bound to the account, not the string. Anonymous visitors can never edit.
- **Avatar**: when `avatar_url` is null the frontend renders the generated pixel avatar of DESIGN.md §4.16, seeded by `dancer.id`; whoever may edit the dancer can choose its parts, stored in `avatar_parts` (decided in M12b). Flags are chips beside it, never drawn into it. Verified dancers may upload a picture (`POST /api/dancers/{id}/avatar`, image ≤ 2 MB, stored on R2) — **deferred** until R2 is set up (decided in M7b). Instagram pictures are never fetched.
- **Merge**: `POST /api/admin/dancers/{id}/merge {into}` moves `entry_members`, `event_staff`, `crew_memberships`, `dancer_claims` to the survivor, unions `aliases`, keeps the survivor's handle (or adopts the loser's if the survivor had none), and sets `merged_into_id` on the loser. `GET /api/dancers/{id}` on a merged row returns `301`-style `{ "merged_into": uuid }`; the frontend redirects.

### Organiser identity (M12c)
- The organiser page is the account's public side: `display_name` (shown on their jams), and the `instagram_handle`, `country`, `city`, `bio` columns of `app_users`. Never the email or role. Only accounts that registered a jam (`organizer`+) have one; only its owner edits it.
- **Verification** is of the handle, not the account: the organiser opens a claim on their current handle (`BJ-` code, same review queue screen as dancers), and approval sets `verified_at` only if the handle is still the claimed one. Changing the handle clears `verified_at` and rejects the pending claim on the old one.

### Event status transitions
```
draft → in_review → published → registration_closed → completed      (organisers)
draft → published                                                    (seed_admin+: no review)
in_review → draft                                                    (admin rejects, with a note)
any (except completed) → cancelled
```
Transitions are explicit endpoints (`POST /events/{id}/submit` etc.), not a free `PATCH status`. Approval and rejection are the admins' (`POST /admin/events/{id}/approve | reject`), decided in M14: every organiser's jam is reviewed, while the BreakingJam team publishes its own directly. A jam in review is private like a draft, and its organiser can keep editing it. Jams published before M14 stay public.

## 5. Backend

### Error handling
- `AppError` enum in `error.rs`: `NotFound`, `Validation(Vec<FieldError>)`, `Unauthorized`, `Forbidden`, `Conflict(String)`, `Internal(anyhow::Error)`.
- `impl IntoResponse for AppError` → JSON body `{ "error": { "code": "not_found", "message": "...", "fields": [...] } }` with the matching HTTP status. Internal errors are logged with `tracing::error!` and return a generic message.
- `From<sqlx::Error>` maps `RowNotFound` → `NotFound`, unique violations → `Conflict`, rest → `Internal`.

### Handlers
- One module per resource in `api/`, exposing `pub fn router() -> Router<AppState>`.
- DTOs (`CreateEventRequest`, `EventResponse`…) live next to handlers, derive `Serialize/Deserialize`, `utoipa::ToSchema`, and `validator::Validate`.
- Handlers are thin: validate → call `db::`/`domain::` → map to response. No SQL in handlers.
- Pagination: `?limit=` (default 50, max 200) and `?cursor=` (opaque, based on `(starts_on, id)` for events). Responses `{ "items": [...], "next_cursor": "..." | null }`.
- IDs in paths are `uuid`. Public event pages also resolve by `slug`.

### Auth
- Password hashing: `argon2` (Argon2id, default params).
- Sessions: `sessions` table, cookie `bj_session` (HttpOnly, Secure, SameSite=Lax, 30-day expiry, rolling). Session id is a UUIDv4 (random, not v7).
- Extractors: `CurrentUser` (required) and `MaybeUser` (optional). `RequireRole(Organizer)` helper. Roles are ordered `user < organizer < seed_admin < admin`; a check for a role passes for any higher role.
- Roles:
  - `user`: can claim a dancer, edit the unverified dancers they created, see everything public.
  - `organizer`: everything above + create jams and manage their own jams (battles, entries, staff), submit them for review, create dancers/crews from within a jam. A `user` who creates their first jam is promoted to `organizer` automatically (jams start as drafts).
  - `seed_admin` ("breakingjam_admin_seed"): everything above + create and edit **any** jam, dancer or crew, including seeding the initial ~200 dancers and historical jams, and publish jams without review. Cannot review jams or claims, merge dancers or manage users.
  - `admin`: everything. Reviews jams and claims, merges dancers, changes roles, sees the overview counts.
- Google OAuth: authorization-code flow with PKCE via `oauth2` crate; on first login create `app_users` row with `google_sub`; on later logins match by `google_sub`, then by verified email.
- Authorization rules:
  - Event write: `organizer_id == user.id`, or `seed_admin`+.
  - Dancer write (unverified): its creator (`created_by`), or `seed_admin`+; logged in `dancer_edits`. Dancer write (verified): `dancer.user_id == user.id`, or `seed_admin`+.
  - Dancer create: `organizer`+ (from a jam), or `user` for their own page (`source = self`).
  - Crew write: `organizer`+ (membership self-service later).
  - Jam review, claims review, merge, role changes, overview counts: `admin` only.

### Routes
```
GET    /api/health
GET    /api/openapi.json
GET    /api/docs                         (Swagger UI, dev only)

POST   /api/auth/register                {email, password, display_name}
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/google                  → redirect
GET    /api/auth/google/callback

GET    /api/stats                        public counts for the landing page: countries with public jams, battles (total and per country, busiest first), dancers
GET    /api/geo                          {country}: the visitor's ISO 3166-1 alpha-2 country from the `cf-ipcountry` header (set by the Worker), null when unknown

GET    /api/events                       ?status=published&country=&from=&to=&mine=&cursor=&limit=   (mine=true: caller's own jams incl. drafts, login required)
GET    /api/events.geojson               published, registration_closed and completed events with coordinates, as FeatureCollection (id, name, slug, starts_on, ends_on, status, city, country, battles: names in display order, categories: what the map's chips match)
GET    /api/events/{id_or_slug}           + can_edit, organizer {id, display_name, instagram_handle, verified} (M12, M12c)
GET    /api/events/{id_or_slug}/flyer.svg  ?compact=&lang=en|fr|de   generated 4:5 flyer to inline (DESIGN.md §4.24)
GET    /api/events/{id_or_slug}/og.png     ?lang=   1200×630 Open Graph image
POST   /api/events                       logged in (promotes `user` → `organizer`)
PUT    /api/events/{id}                  owner/admin
DELETE /api/events/{id}                  soft delete, owner/admin
POST   /api/events/{id}/submit | publish | close-registration | complete | cancel   (publish: seed_admin+, skips review)

GET    /api/events/{id}/battles          ordered by position
POST   /api/events/{id}/battles          {name?, format, team_size?, gender, age, age_min?, age_max?, bracket_size?, max_entries?, prize_currency?, prize_first?, prize_second?, prize_third?, starts_at?}
PUT    /api/battles/{id}
DELETE /api/battles/{id}
PUT    /api/events/{id}/battles/order    [battle_id, ...]

GET    /api/battles/{id}/entries
POST   /api/battles/{id}/entries         {team_name?, crew_id?, dancer_ids: [...]}
PUT    /api/entries/{id}                 status, reached, final_rank, video_url, video_offset_seconds, members
DELETE /api/entries/{id}

GET    /api/events/{id}/staff
PUT    /api/events/{id}/staff            replace full list

GET    /api/dancers                      ?q=&country=&verified=&cursor=&limit=   (q = ilike on dancer_name, aliases and instagram_handle; verified = true|false; notable first)
GET    /api/dancers/{id}                 profile + current crews
GET    /api/dancers/{id}/events          ?scope=upcoming|past (default both, grouped)  — jams where the dancer is an entry member or staff; each item: event (id, name, slug, starts_on, ends_on, city, country, status), battle (id, name, format, team_size, gender, age), role (competitor|judge|dj|mc…), entry status, reached, final_rank, video_url
POST   /api/dancers
PUT    /api/dancers/{id}                 see authorization rules; writes dancer_edits when unverified
DELETE /api/dancers/{id}                 soft delete, seed_admin+
POST   /api/dancers/{id}/claim           logged-in user → {code, status: pending}
GET    /api/dancers/{id}/claim           current user's claim on this dancer, if any
                                         (claims carry others_pending: someone else asked too; M12b)
POST   /api/dancers/{id}/avatar          multipart image, owner only   (deferred: needs R2)

GET    /api/admin/stats                  overview counts: jams by status, dancers and organisers (verified, with Instagram), accounts (new in 30 days), pending claims   admin
GET    /api/admin/events                 jams in review, soonest first, with their organiser   admin
POST   /api/admin/events/{id}/approve    in_review → published   admin
POST   /api/admin/events/{id}/reject     {note} in_review → draft   admin
GET    /api/admin/claims                 ?status=pending   admin
POST   /api/admin/claims/{id}/approve    admin
POST   /api/admin/claims/{id}/reject     admin
POST   /api/admin/dancers/{id}/merge     {into: uuid}      admin
PUT    /api/admin/users/{id}/role        admin

GET    /api/organizers/{id}              organiser page + can_edit; 404 below `organizer` (M12c)
PUT    /api/organizers/{id}              own page only
GET    /api/organizers/{id}/events       public jams, {upcoming, past}
POST   /api/organizers/{id}/claim        own page, needs a handle → {code, status: pending}
GET    /api/organizers/{id}/claim        own latest claim
GET    /api/admin/organizer-claims       ?status=pending   admin
POST   /api/admin/organizer-claims/{id}/approve | reject   admin

GET    /api/crews                        ?q=&cursor=&limit=
GET    /api/crews/{id}                   includes current members
POST   /api/crews
PUT    /api/crews/{id}
DELETE /api/crews/{id}
POST   /api/crews/{id}/members           {dancer_id, since?}
DELETE /api/crews/{id}/members/{dancer_id}   sets until = today
```

### Config (env)
```
DATABASE_URL, APP_PORT (default 8080), APP_BASE_URL, FRONTEND_ORIGIN (CORS),
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL, RUST_LOG
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
- Routing: `/` (landing), `/map`, `/jams` (Find a jam, the list), `/jams/{slug}`, `/search` (jams and people), `/dancers` (Find someone), `/dancers/{id}`, `/login`, `/register`, `/org/jams` (organiser list), `/org/jams/new`, `/org/jams/{id}/edit`, `/organizers/{id}` (M12c), and for admins `/admin` (overview), `/admin/jams` (review), `/admin/claims` and `/admin/dancers/{id}/merge`. No `/crews` routes yet; crews render inline.
- Dancer page (`/dancers/{id}`): header (avatar, dancer name, one or two country flags, city, current crews, Instagram link, verified tick when `verified_at` is set, "Verify me" button for logged-in non-owners while unverified, "Edit" for whoever is allowed), then two lists from `GET /api/dancers/{id}/events` — **Upcoming** (jams with `starts_on >= today`, link to `/jams/{slug}`) and **Past** (reverse chronological, with battle name, role, a result badge (`final_rank` as "1st/2nd/3rd", else `reached` as "Top 8"…), and a play icon when the entry has a `video_url`). Empty states for each. This page is the seed of the "where does this bboy go / what did he do" feature; the only edit affordances are those in §4 "Dancer identity".
- Video embeds: a play icon on an entry (jam page or dancer page) opens a modal with the official YouTube iframe (`youtube-nocookie.com/embed/{id}?start={offset}&rel=0`). Only YouTube URLs are accepted, validated server-side (`youtube.com/watch`, `youtu.be`, `youtube.com/live`); the video id is parsed once on save. Nothing is ever downloaded or hosted.
- Landing page (`/`), in order (M18, DESIGN.md §6 Landing):
  - The hero: the title "Find your next jam" (the page's only `<h1>`), the subtitle, and the search, whose round J logo button hands the words to `/search?q=`.
  - **Next up near you**: up to six upcoming jams as grid cards. By the visitor's position when they already allowed it (or tap "change" to share it): the nearest, soonest first. Else by their country (`GET /api/geo`): that country's jams first, soonest first, then the nearest others measured from the centre of its box (§6 Map); with an unknown country, the soonest anywhere. Hidden when nothing is upcoming.
  - **The scene so far**: battles, countries and dancers from `GET /api/stats`, then the 10 busiest countries as chips and "+N more". Public jams count, cancelled ones don't.
  - Then the footer: round logo, tagline, links, Instagram, language switch.
  M10 decided "no data fetching on this page"; M15 reverses that at the author's request. The map preview and the For dancers and For organisers bands are gone since M18; the organisers' pitch moves to a future `/register` landing.
- Search (`/search?q=`): the jams the words match, matched in the browser like the map's search (name, city, country), upcoming first, up to 10 then "See all on the map" (`/map?q=`); and the people from `GET /api/dancers?q=`, paged. A blank search shows the upcoming jams and the notable people.
- Find a jam (`/jams`): every jam from `GET /api/events.geojson` as a list, with the map's search and filter chips, upcoming first (past ones with the "Past jams" chip), 30 at a time. The search is kept in `?q=`.
- Header: Jam map, Find a jam, Find someone, then the language switch, Log in or the account menu (My jams, Admin for admins, Log out) and **Register a jam**. The full bar shows from `xl`; below, a menu sheet holds the same items.
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
  - First view: the visitor's country from `GET /api/geo`, framed by a bounding box from Natural Earth (main landmass and nearby islands, `features/map/countryBounds.ts`). A country without upcoming jams is widened to its three nearest jams; an unknown country frames every jam. In development, `DEV_COUNTRY` in `frontend/.env` stands in for Cloudflare.
  - Click a point → popup with name, dates, city → link to `/jams/{slug}`.
  - Filters and search (decided in M11), all client-side over the one GeoJSON download: **When** (this weekend, next 30 days, past jams; one at a time) and **battle categories** (1v1, 2v2, crews, 7 to smoke, bgirl, kids; any one matches), combined with AND. Search matches every word against name, city, country code and country name (accents ignored); Enter fits the map to the matches and opens the jam when there is one. Without a time filter the map shows upcoming jams; **Past jams** shows the completed ones, most recent first, and a search looks through both, so "red bull" finds every BC One. No Cancelled filter yet.
  - Container: `height: 100dvh` minus header, `touch-action: none`.
- Dancer picker (used in entry and staff editing): debounced search on `dancer_name` showing existing matches; "create new dancer" is only enabled after a search has run (search-before-create). The crew picker works the same way.
- Jam location (decided in M12): the organiser types the address, city and country; **Find on the map** searches them with OpenStreetMap's Nominatim from the browser (on that click only, never as-you-type, at most once a second, attributed under the field), drops the pin on the best match and lists the others; the pin can then be tapped or dragged. Without a pin a jam is published but stays off the map.
- On the jam page, every dancer (entries, staff) is a link chip with their avatar, to `/dancers/{id}`.
- Jam page facts (M15): dates, venue, then the optional website (its host as the label, e.g. "pariscypher.com", opening in a new tab), contact email (a `mailto:` link, public by the organiser's choice) and Instagram. The description is a short pitch of at most 200 characters (About). Each of these shows only when set; the dev seed fills them on its invented jams, the imported historical jams leave them empty.
- People are managed on the jam page, not in the editor: its organiser sees **Add a dancer** (or **Add a team**) under each battle, an add chip per lineup role (judge, DJ, MC, host, staff), and edit and delete on each entry and person, withdrawn entries included. `/org/jams/{id}/edit` keeps the status, details and battles (with their prizes).
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
```
Seed script: `cargo run --bin seed` inserts an `admin`, a `seed_admin` user ("BreakingJam Team") and an `organizer` ("Cypher Collective", with two jams waiting for review), then **imports the real past jams of `data/`** (Red Bull BC One, Battle of the Year, Outbreak Europe, Unbreakable…, owned by the `seed_admin`): every jam that passes `data check`, with its dancers, crews, staff and results, completed or published by date; the rest is left out (`RUST_LOG=seed=debug` lists what and why). On top come invented upcoming jams with registrations, drafts and in-review jams, invented dancers (one pair of deliberate near-duplicates for merge testing, DJs and MCs) and 5 crews; a dancer of `data/` they name (Menno, Hong 10…) is the imported row. It refuses any database host other than localhost, except the one `SEED_ALLOW_HOST` names exactly (UAT's). The real ~200 notable dancers are entered by hand through the UI by a `seed_admin`, not by this script.

**Curated data** (`data/`, guide in `data/README.md`): real jams and their results (Red Bull BC One World Finals first) as reviewed TOML files, the source of truth for those jams; the app shows them read-only and fixes are made in the files. `cargo run --bin data -- check` validates them in CI (brackets consistent, every dancer and crew known, codes and links well-formed); `draft-wikipedia` and `draft-youtube` (from a channel's battle videos, through the YouTube Data API) draft new editions for a human to review. Battles are 1v1 or team battles (2v2, crews) whose sides are a crew, a named team and/or members; dancers belong to zero or more crews, as in `crew_memberships`. Each dancer, jam and battle has a stable key; the import (next step) keeps database rows in step with the files.

## 9. Deployment (built in M13; guide in `deploy/README.md`)

- **Targets**: production (`breakingjam.com`, branch `prod`) and UAT (`uat.breakingjam.com`, branch `uat`, the `env.uat` Worker `breakingjam-uat`). Same code, separate Neon projects, secrets and Google OAuth clients. UAT holds seeded demo data only, never production data; its Worker (`TEST_SITE`) marks every response noindex, disallows all in robots.txt and badges every page as a test site until the visitor closes the badge (a cookie remembers it for a year), and Cloudflare Access can keep it private. `main` is the development branch and deploys nowhere.
- **Domain**: `breakingjam.com` on Cloudflare DNS. One Worker per target (`deploy/`) serves the site at the apex and the API same-origin under `/api/*` (session cookies stay first-party; no CORS in prod). `www` redirects to the apex with a zone Redirect Rule.
- **Frontend**: Workers static assets from `frontend/dist` with the SPA fallback, not Cloudflare Pages (Cloudflare's current recommendation; one Worker, one deploy). Built with `VITE_API_URL` empty (same origin). `frontend/public/_headers` sets CSP, HSTS and the immutable cache for `/assets/*`.
- **Visitor country**: the Worker sets `cf-ipcountry` on every `/api/*` request from `request.cf.country`, replacing any value the client sent; `GET /api/geo` reads it for the map's first view.
- **Open Graph**: the Worker runs first for `/jams/{slug}`, reads the jam from the API as an anonymous visitor (drafts stay hidden) and appends `og:*` tags (title, dates and city, `/api/events/{slug}/og.png`) to `index.html` with HTMLRewriter.
- **API**: `backend/Dockerfile` (multi-stage, `cargo-chef`, distroless) runs as a Cloudflare Container (GA April 2026, Workers Paid plan). The Worker passes its vars and secrets to it as environment variables and spreads requests over `API_INSTANCES` instances. Instances sleep after 30 minutes idle and wake in 1–3 s. The Dockerfile stays generic.
- **DB**: Neon Postgres, reached **directly over TLS** with the API's own sqlx pool. Hyperdrive was the plan, but containers can't use it (cloudflare/containers#97, open as of October 2026). Migrations run from the deploy workflow with `sqlx migrate run` before the new containers roll out, so they must stay compatible with the API version still running. The API connects as `breakingjam_app` (rows only, no DDL); migrations use the owner role.
- **Releases**: commits move `main` → `uat` → `prod` by fast-forward pushes. A push to `uat` or `prod` starts `.github/workflows/deploy.yml` in the GitHub environment of the same name (`prod` needs a reviewer): the full CI, the frontend build, a Neon snapshot branch, the migrations, `wrangler deploy` (Worker, assets, image), then a `/api/health` check. `wrangler rollback` returns to the previous Worker version.
- **Backups**: the pre-deploy Neon branch (kept 7 days), Neon point-in-time restore, and a nightly `pg_dump` of production to R2 (`.github/workflows/backup.yml`, kept 30 days, read-only role `breakingjam_backup`).
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

For Every suggested build order point, save it in milestones/ with a filename matching the build order point.