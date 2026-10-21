# Milestone 13 — Coverage pass, README, production deploy, v0.1.0

Build order point 13 of `ARCHITECTURE.md` §11, plus two requests from the author: tests out of the source files, and everything needed to deploy to production on Cloudflare.

## Decisions (asked at the start)

- **Rust unit tests:** moved to `backend/tests/unit/`, mirroring `src/`. `lib.rs` includes them under `cfg(test)`; the private helpers they test became `pub(crate)`. Source files hold no tests.
- **Frontend tests:** moved to `frontend/tests/`, mirroring `src/` (helpers in `tests/support/`, setup in `tests/setup.ts`).
- **Deploys:** GitHub Actions on a `v*` tag, or a manual run.
- **Doc updates:** CLAUDE.md's test rule and ARCHITECTURE §3, §7 and §9 updated accordingly.

## Tests moved

- **Rust:** 16 inline `mod tests` blocks became files under `tests/unit/` (`tests/unit/domain/dancer.rs` tests `src/domain/dancer.rs`). Each imports what it uses instead of `super::*`.
  - Widened to `pub(crate)`: `api::{auth, page}` (modules), `safe_next`, `read_cookie`, `cookie`, `AUTH_URL`, `contains_pattern`, `CODE_ALPHABET`, `avatar_parts_shape`, `web_url`, `iana_timezone`, `NameFit`, `fit_name`, `FLYER_NAME`, `OG_NAME`, `FONTS`. All are documented.
  - Cargo only picks up top-level `tests/*.rs` as integration targets, so `tests/unit/` adds no binaries.
- **Frontend:** 24 test files plus the helpers. Imports and `vi.mock` paths were recomputed, `tsconfig.app.json` includes `tests`, and Vitest's setup file moved.
  - Vitest's async wait is 5 s: lazy pages took over 1 s to transform when every file runs in parallel.

## Coverage pass

- I ran every integration test with a temporary recorder (method, URI, status, mapped onto `openapi.json`; removed afterwards).
  - Every route is called, but many documented 401, 403 and 404 answers were never exercised.
  - `POST /admin/organizer-claims/{id}/reject` and `GET /events/{id}/staff` weren't called at all.
- **`tests/access.rs`** closes the gaps by reading `openapi.json`, so a new route is covered once documented:
  - every route that needs a session answers 401 without one, and checks it before reading the body
  - every route taking an id answers 404 for an unknown one (an admin caller, a valid body)
  - 403 on someone else's jam, battle, entry, staff, crew, dancer and organiser page, and on every admin route for a non-admin
  - every resource that takes input names its invalid field (`{ error: { code: "validation", fields: [{ field, message }] } }`)
  - every paged list rejects a garbled cursor (5 lists)
  - each sweep asserts how many routes it covered, so a filter bug can't make it pass empty
- **Specific gaps:** organiser claim rejection then a new claim, the lineup read back, a taken handle on a dancer update (409).
- **Backend total:** 118 → 125 tests. No handler behaviour had to change: every route already answered as documented.

## Production (`deploy/`, guide in `deploy/README.md`)

- **One Worker** on `breakingjam.com`:
  - `/api/*` goes to the API container (`backend/Dockerfile`, Rust), two instances, 30 minutes idle before sleeping.
  - `/jams/{slug}` gets `index.html` with Open Graph tags (title, dates and city, the 1200×630 image) read from the API as an anonymous visitor, so drafts stay hidden.
  - Everything else is static assets with the SPA fallback.
- **Secrets** (`DATABASE_URL`, Google) go into the container from Worker secrets; plain settings are `vars`. Not committed: `deploy/.dev.vars` (git-ignored, an example is committed).
- **Two deviations from §9, both recorded there:**
  - Workers static assets instead of Pages (Cloudflare's current recommendation; one Worker).
  - **Neon directly over TLS instead of through Hyperdrive:** Hyperdrive [doesn't work from containers](https://github.com/cloudflare/containers/issues/97), still open in October 2026.
- **`frontend/public/_headers`:**
  - A CSP allowing exactly what the app loads: Protomaps tiles and fonts, Nominatim, the YouTube player, MapLibre's worker.
  - HSTS, `nosniff`, Referrer-Policy, Permissions-Policy (geolocation only for the site).
  - An immutable cache on `/assets/*`.
- Also new: `robots.txt`, a favicon (the §7 map marker) and a meta description.
- **`.github/workflows/deploy.yml`:** on a `v*` tag or by hand, it runs the whole CI (now callable), builds the frontend with the production variables, runs `sqlx migrate run` against Neon, then `wrangler deploy` (Worker, site, image built for linux/amd64).
- CI checks the Worker too (`worker` job: types and tests). `just check` runs it, and `just prod-local` runs the production setup locally.
- `www` redirects to the apex with a zone Redirect Rule rather than through the Worker. Otherwise static paths on `www` would serve a second copy of the site, outside the cookies and Google sign-in.

## Checked locally, as in production

`wrangler dev` ran the real setup: the Worker, the built site, and the API image built from `backend/Dockerfile` for linux/amd64 (emulated on Apple silicon). It used a scratch database, since dropped.

- `/api/health` answered through the Worker from the container, which reached Postgres.
- Every `_headers` rule was applied: CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, and `immutable` on `/assets/*`. `/map` fell back to `index.html`.
- `/jams/{slug}` came back with its title, `og:*` tags, image and canonical link; an unknown slug got the plain page; `og.png` returned a 38 kB PNG.
- **Chrome under the CSP:** no violations and no failed requests on the landing page, the map (Protomaps tiles and labels, markers), a jam page with its flyer, the YouTube player, a dancer page with its pixel avatar, and the jam form's Nominatim search.
- **Found and fixed:** a `www` → apex redirect inside the Worker would only have run for `/api/*` and `/jams/*` (the paths it handles first). It is now a zone Redirect Rule.

## README

A root `README.md`: what the product is, the stack, running it locally (`just dev`, seeded accounts), tests, deploying, and the repository layout.

## Release

The tag is the author's to create after committing: `git tag -a v0.1.0 -m "BreakingJam v0.1.0" && git push origin v0.1.0`. Pushing it also starts the first production deploy once the one-time setup in `deploy/README.md` is done.

## New dependencies (npm, `deploy/` only)

- `@cloudflare/containers` — the Container class the Worker uses to run and reach the API.
- `wrangler` — builds and deploys the Worker, the site and the image.
- `@cloudflare/workers-types`, `typescript`, `vitest` — the Worker's types and tests (same TypeScript and Vitest as the frontend).

## Feedback round (after M13)

Five requests from the author, after trying the build.

- **The map starts on the visitor's country** (e.g. Switzerland when browsing from there).
  - The Worker passes `request.cf.country` to the API as `cf-ipcountry`, replacing any value the client sent. The new `GET /api/geo` returns it as `{ country }` (null for unknown, Tor `T1` and `XX`).
  - The frontend fits that country's box: Natural Earth 1:50m, main landmass plus islands within 5°, 237 countries in `features/map/countryBounds.ts` (6.6 kB). Malaysia keeps both halves by hand.
  - **Decision (asked):** a country with no upcoming jam is widened to its 3 nearest jams. An unknown country frames every jam, as before.
  - Locally, `DEV_COUNTRY` in `frontend/.env` plays Cloudflare's part through the Vite proxy.
- **Cash prizes on battles.**
  - **Decision (asked):** one amount per place (1st, 2nd, 3rd) in one ISO 4217 currency. Migration `20261015000002_battle_prizes.sql` adds `prize_currency char(3)` and `prize_first/second/third integer >= 0`.
  - A currency without a prize, or a prize without a currency, is a 422 on `prize_currency`.
  - The form has a currency select (every code the browser knows, named in the UI language), then the three amounts.
  - The jam page shows "1st CHF 1,000 · 2nd CHF 500" with a trophy, formatted for the reader's language without cents. The editor's battle summary shows the same line.
- **Seed** (local only):
  - **Accounts:** `seed@breakingjam.local` is now "BreakingJam Team".
  - **Jams:** 12 jams (two past ones added, Vienna and Vancouver), each with two battles, a lineup and, on most, prizes in local currencies.
  - **Dancers:** 20 well-known bboys join the fictional dancers. Each has at least one past result; those results are invented.
  - **Results:** completed jams list their entrants in finishing order (winner, final, semis…), so results stay consistent.
  - **Checks:** each battle goes through the API's validation (`BattleFields::validate`), and each entry through `EntryFields::normalize` and the shared `insert_entry`.
  - **Guard:** the seed refuses any database host other than localhost.
- **People are managed on the jam page, not in the editor.**
  - The organiser sees **Add a dancer** (**Add a team** for team battles) under each battle, and an add chip for each lineup role. Each entry has edit and delete; each lineup chip has remove. Withdrawn entries stay visible, marked.
  - `/org/jams/{id}/edit` keeps the status, details and battles, and links to the jam page for the people, drafts included.
  - `EntriesEditor` and `StaffEditor` were deleted. `BattleCard` and `Lineup` live in `features/jams/`.
- **Dancers as chips with their avatar.** Every competitor and lineup member is a link chip (round border) with a 28px pixel avatar. `DancerRef` now carries `avatar_url` and `avatar_parts`. DESIGN.md §4.12 and §6 describe the dancer chip and the add chip.
