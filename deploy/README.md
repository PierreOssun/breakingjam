# Deploying BreakingJam to Cloudflare

Production is one Cloudflare Worker on `breakingjam.com` (ARCHITECTURE §9):

```
browser ──▶ Worker "breakingjam" (deploy/src/index.ts)
              ├─ /api/*     ──▶ API container (backend/Dockerfile, Rust) ──▶ Neon Postgres
              ├─ /jams/{slug} ─▶ index.html + Open Graph tags (jam read from the API)
              └─ anything else ─▶ static assets (frontend/dist, SPA fallback)
```

- The site and the API share one origin, so session cookies stay first-party and CORS never applies.
- The API runs as a [Cloudflare Container](https://developers.cloudflare.com/containers/) (GA since April 2026, **Workers Paid plan** required).
  - `API_INSTANCES` (2) instances share the traffic. Each sleeps after 30 minutes without requests and wakes in 1–3 s.
- The database is [Neon](https://neon.tech). The container connects to it directly over TLS. Hyperdrive [can't be reached from containers](https://github.com/cloudflare/containers/issues/97), so this differs from the original plan in §9.
- `frontend/public/_headers` sets the security headers (CSP, HSTS…) and the long cache for `/assets/*`.
- The Worker passes the visitor's country (`request.cf.country`) to the API as `cf-ipcountry`, replacing any value the client sent. The map starts on that country (`GET /api/geo`).

## One-time setup

1. **Cloudflare**
   - Put `breakingjam.com` on Cloudflare DNS. The Worker adds the apex record itself.
   - For `www`: a proxied `AAAA www 100::` record, and a Redirect Rule (Rules → Redirect Rules → "Redirect from WWW to root", status 301, keep the query string).
   - Subscribe to Workers Paid (containers).
   - Create an API token with *Workers Scripts: Edit*, *Workers Routes: Edit*, *Containers: Edit*, *Zone: Read* and *DNS: Edit* on the zone; copy your account id.
2. **Neon:** create a project (region close to your users, e.g. `aws-eu-central-1`) with a database `breakingjam`. Copy the **direct** (not `-pooler`) connection string, with `?sslmode=require`. Each API instance keeps a pool of up to 10 connections.
3. **Google sign-in:** in the Google Cloud console, OAuth client of type *Web application*.
   - Authorised redirect URI: `https://breakingjam.com/api/auth/google/callback`.
4. **Protomaps:** add `breakingjam.com` to the key's allowed origins (the key is public; the origin list protects it).
5. **Secrets:** the API reads them through the Worker. From `deploy/`:
   ```sh
   npm ci
   npx wrangler login
   npx wrangler secret put DATABASE_URL          # the Neon connection string
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   The other settings are plain `vars` in `wrangler.jsonc` (`APP_BASE_URL`, `GOOGLE_REDIRECT_URL`, `RUST_LOG`, `API_INSTANCES`).
6. **GitHub:** repository Settings → Environments → `production`.
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL` (the same Neon string, for migrations).
   - Variables: `VITE_PROTOMAPS_KEY`, and `VITE_TILES_URL` only with self-hosted tiles.
   - Required reviewers on the environment make each deploy wait for an approval.

## Deploying

Push a version tag, or run **Deploy** from the Actions tab:

```sh
git tag -a v0.1.0 -m "BreakingJam v0.1.0"
git push origin v0.1.0
```

`.github/workflows/deploy.yml` then:

1. runs the whole CI (backend, frontend, worker, Docker image)
2. builds the frontend with the production variables
3. runs `sqlx migrate run` against Neon
4. runs `wrangler deploy`, which builds the image from `backend/Dockerfile` (linux/amd64), pushes it to Cloudflare's registry, uploads the site and rolls the containers

**Migrations run before the new API starts**, so the API still serving must work with them: add columns and tables first, and drop old ones a release later.

## First admin

Sign up on the site, then in Neon's SQL editor:

```sql
update app_users set role = 'admin' where email = 'you@example.com';
```

Admins see **Claims** in the header (Instagram verification queue) and the merge tool on dancer pages. Don't run `cargo run --bin seed` in production: it inserts demo jams and dancers.

## Operating

- **Logs:** `npx wrangler tail` (Worker), or the Containers page of the dashboard (API, JSON lines with request ids).
- **Rollback:** `npx wrangler rollback` returns the Worker, site and container image to the previous version. Migrations are not reverted.
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
