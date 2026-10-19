# Deploying BreakingJam to Cloudflare

Two copies of the same stack, each one Cloudflare Worker (ARCHITECTURE §9):

| | Production | UAT |
|---|---|---|
| Branch | `prod` | `uat` |
| Site | `breakingjam.com` (public) | `uat.breakingjam.com` (behind Cloudflare Access) |
| Worker | `breakingjam` (top level of `wrangler.jsonc`) | `breakingjam-uat` (`env.uat`) |
| Database | Neon project `breakingjam`, real data | Neon project `breakingjam-uat`, seeded demo data only |
| GitHub environment | `prod` (a reviewer approves each deploy) | `uat` |

`main` is the development branch and deploys nowhere. **Production data never goes to UAT**, not even a copy for debugging.

```
browser ──▶ Worker (deploy/src/index.ts)
              ├─ /api/*     ──▶ API container (backend/Dockerfile, Rust) ──▶ Neon Postgres
              ├─ /jams/{slug} ─▶ index.html + Open Graph tags (jam read from the API)
              └─ anything else ─▶ static assets (frontend/dist, SPA fallback)
```

- The site and the API share one origin, so session cookies stay first-party and CORS never applies. Cookies have no `Domain`, so a UAT session is never sent to production.
- The API runs as a [Cloudflare Container](https://developers.cloudflare.com/containers/) (GA since April 2026, **Workers Paid plan** required).
  - `API_INSTANCES` instances share the traffic (2 in production, 1 on UAT). Each sleeps after 30 minutes without requests and wakes in 1–3 s.
- The database is [Neon](https://neon.tech). The container connects to it directly over TLS. Hyperdrive [can't be reached from containers](https://github.com/cloudflare/containers/issues/97), so this differs from the original plan in §9.
  - The API uses the role `breakingjam_app`, which reads and writes rows but can't change the schema. Migrations use the owner role.
- `frontend/public/_headers` sets the security headers (CSP, HSTS…) and the long cache for `/assets/*`.
- The Worker passes the visitor's country (`request.cf.country`) to the API as `cf-ipcountry`, replacing any value the client sent. The map starts on that country (`GET /api/geo`).

## One-time setup

Do steps 2–8 once for production and once for UAT, with that target's values.

1. **Cloudflare**
   - Put `breakingjam.com` on Cloudflare DNS. Each Worker adds its own record (`breakingjam.com`, `uat.breakingjam.com`) and certificate on its first deploy.
   - For `www`: a proxied `AAAA www 100::` record, and a Redirect Rule (Rules → Redirect Rules → "Redirect from WWW to root", status 301, keep the query string).
   - Subscribe to Workers Paid (containers).
   - Create an API token with *Workers Scripts: Edit*, *Workers Routes: Edit*, *Containers: Edit*, *Zone: Read* and *DNS: Edit* on the zone; copy your account id.
2. **Neon:** one project per target (`breakingjam`, `breakingjam-uat`), each with a database `breakingjam`, in a region close to your users (e.g. `aws-eu-central-1`).
   - Use **separate projects**, not a branch of production: a branch starts with production's data, and separate projects have separate credentials.
   - Copy the owner's **direct** (not `-pooler`) connection string, with `?sslmode=require`. Only migrations use it.
   - Create a project-scoped API key (Project settings → API keys) and note the project id. The deploy snapshots the database with them.
3. **Database roles:** in the Neon SQL editor, **as the owner role** (the one migrations use), run the following. Generate each password with `openssl rand -hex 24`. Create the roles with SQL, not in the console: console roles join `neon_superuser`.
   ```sql
   -- The API: reads and writes rows, never changes the schema.
   create role breakingjam_app login password '<password>';
   grant usage on schema public to breakingjam_app;
   grant select, insert, update, delete on all tables in schema public to breakingjam_app;
   grant usage, select on all sequences in schema public to breakingjam_app;
   alter default privileges in schema public grant select, insert, update, delete on tables to breakingjam_app;
   alter default privileges in schema public grant usage, select on sequences to breakingjam_app;

   -- Production only, for the nightly backup: reads everything, writes nothing.
   create role breakingjam_backup login password '<password>';
   grant usage on schema public to breakingjam_backup;
   grant select on all tables in schema public to breakingjam_backup;
   grant select on all sequences in schema public to breakingjam_backup;
   alter default privileges in schema public grant select on tables to breakingjam_backup;
   alter default privileges in schema public grant select on sequences to breakingjam_backup;
   ```
   The default privileges cover tables that later migrations create, as long as migrations run as this same owner role.
4. **Google sign-in:** one OAuth client of type *Web application* per target.
   - Authorised redirect URI: `https://breakingjam.com/api/auth/google/callback`, or `https://uat.breakingjam.com/api/auth/google/callback`.
   - Keep the UAT client in *Testing* with your testers listed as test users.
5. **Protomaps:** add `breakingjam.com` and `uat.breakingjam.com` to the key's allowed origins (the key is public; the origin list protects it).
6. **Secrets:** the API reads them through the Worker. From `deploy/`, add `--env uat` for UAT:
   ```sh
   npm ci
   npx wrangler login
   npx wrangler secret put DATABASE_URL          # breakingjam_app's direct connection string
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   The other settings are plain `vars` in `wrangler.jsonc` (`APP_BASE_URL`, `GOOGLE_REDIRECT_URL`, `RUST_LOG`, `API_INSTANCES`).
7. **GitHub:** repository Settings → Environments → `prod` and `uat`.
   - Deployment branches: only `prod` for `prod`, only `uat` for `uat`.
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` (the **owner** string, for migrations), `NEON_API_KEY`.
   - Variables: `NEON_PROJECT_ID`, `VITE_PROTOMAPS_KEY`, and `VITE_TILES_URL` only with self-hosted tiles.
   - `prod` only: required reviewers, so each production deploy waits for an approval.
   - Settings → Rules: a ruleset on `uat` and `prod` blocking force pushes and deletion.
8. **UAT only: Cloudflare Access** (Zero Trust → Access → Applications, free up to 50 users). It keeps UAT private and out of search engines.
   - A self-hosted application for `uat.breakingjam.com`, policy *Allow* with your testers' emails (login with a one-time PIN).
   - A second application for `uat.breakingjam.com/api/health`, policy *Bypass* for *Everyone*, so the deploy's check gets through. The more specific path wins.
9. **UAT only: demo data.** After the first UAT deploy, from `backend/` with the UAT **owner** string:
   ```sh
   DATABASE_URL='<UAT owner string>' SEED_ALLOW_HOST='<its host, ep-….neon.tech>' SEED_PASSWORD='<password>' cargo run --bin seed
   ```
   The seed refuses any remote host that `SEED_ALLOW_HOST` doesn't name exactly. Never point it at production.
10. **Production only: backups.** See [Backups](#backups).

## Releasing

Changes move forward only: `main` → `uat` → `prod`, as fast-forwards, so production gets exactly the commits tested on UAT.

```sh
git push origin main:uat     # deploy UAT
# test on https://uat.breakingjam.com
git push origin uat:prod     # deploy production, once a reviewer approves
```

A fix goes the same way: commit it on `main`, then promote it. If a push is rejected as non-fast-forward, the target branch has commits that `main` lacks; merge them into `main` first, never force-push.

Optionally tag releases on `prod` (`git tag -a v0.1.0 prod -m "BreakingJam v0.1.0"`).

On each push to `uat` or `prod`, `.github/workflows/deploy.yml`:

1. runs the whole CI (backend, frontend, worker, Docker image)
2. builds the frontend with the target's variables
3. snapshots the database as a Neon branch `pre-deploy-<time>-<commit>` (no compute, expires after 7 days)
4. runs `sqlx migrate run` against the target's Neon project
5. runs `wrangler deploy` (`--env uat` for UAT), which builds the image from `backend/Dockerfile` (linux/amd64), pushes it to Cloudflare's registry, uploads the site and rolls the containers
6. checks that `/api/health` answers

**Migrations run before the new API starts**, so the API still serving must work with them: add columns and tables first, and drop old ones a release later. UAT runs each migration first, against UAT's data.

## Backups

- **Before each deploy:** the `pre-deploy-…` Neon branch. To undo a release that damaged data, restore the main branch from it in the Neon console (Branches → Restore), or point `DATABASE_URL` at it.
- **Any moment in the restore window:** Neon's point-in-time restore. The window depends on the Neon plan; check it covers the time you'd need to notice a problem.
- **Nightly, outside Neon:** `.github/workflows/backup.yml` dumps production at 03:17 UTC to the R2 bucket `breakingjam-backups`, kept 30 days. Setup, once:
  ```sh
  npx wrangler r2 bucket create breakingjam-backups
  npx wrangler r2 bucket lifecycle add breakingjam-backups expire-30d --expire-days 30
  ```
  GitHub environment `backup`, deployment branch `main` (scheduled runs use it), no reviewers:
  - Secrets: `DATABASE_URL` (the `breakingjam_backup` role's direct string), `CLOUDFLARE_API_TOKEN` (a token with only *Workers R2 Storage: Edit*), `CLOUDFLARE_ACCOUNT_ID`.
- **Restore drill**, now and then. Restore into a throwaway Neon branch or project, **never into UAT**:
  ```sh
  npx wrangler r2 object get breakingjam-backups/2026-10-19.dump --file breakingjam.dump --remote
  pg_restore --no-owner --no-privileges --dbname='<throwaway owner string>' breakingjam.dump
  ```
  Then delete the throwaway.

## First admin

Sign up on the site, then in Neon's SQL editor:

```sql
update app_users set role = 'admin' where email = 'you@example.com';
```

Admins see **Claims** in the header (Instagram verification queue) and the merge tool on dancer pages. On UAT the seed already created admin accounts.

## Operating

- **Logs:** `npx wrangler tail` (`--env uat` for UAT) for the Worker, or the Containers page of the dashboard (API, JSON lines with request ids).
- **Rollback:** `npx wrangler rollback` returns the Worker and site to the previous version; whether it also restores the container image is not yet verified (try it on UAT first). Migrations are not reverted.
- **Health:** `https://breakingjam.com/api/health` answers `{"status":"ok","version":"…"}` when the API reaches the database.
- **Self-hosted tiles later:**
  - Upload a `.pmtiles` extract to R2 behind a public bucket domain and set `VITE_TILES_URL=pmtiles://https://tiles.breakingjam.com/world.pmtiles`.
  - Add that host to `connect-src` in `frontend/public/_headers`.

## Trying it locally

The production setup runs on your machine with Docker running:

```sh
cp deploy/.dev.vars.example deploy/.dev.vars       # local database, local URLs
(cd frontend && VITE_API_URL= npm run build)       # same-origin build
(cd deploy && npm run dev)                         # http://localhost:8787
```

The first start builds the API image for linux/amd64, which is slow on Apple silicon (emulated). Later starts reuse the cache.
