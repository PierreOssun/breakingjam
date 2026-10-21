# Milestone 4 — Auth (register/login/logout/me, session extractor), then Google OAuth

Build order point 4 of `ARCHITECTURE.md` §11.

## Done

### Routes (`backend/src/api/auth.rs`)

| Route | Result |
|---|---|
| `POST /api/auth/register` `{email, password, display_name}` | 201 + user, logged in (session cookie set). 409 if the email exists (case-insensitive), 422 with every invalid field. |
| `POST /api/auth/login` `{email, password}` | 200 + user + cookie. 401 for unknown email, wrong password or Google-only account (same answer for all three). |
| `POST /api/auth/logout` | 204, deletes the session row, clears the cookie. Works without a session too. |
| `GET /api/auth/me` | 200 + user, and slides the session 30 days forward. 401 without a valid session. |
| `GET /api/auth/google?next=/path` | 303 to Google with PKCE (S256) + CSRF state; flow kept in a 10-minute `bj_oauth` cookie. |
| `GET /api/auth/google/callback` | Checks state, exchanges the code, reads the profile, logs in, 303 to `FRONTEND_ORIGIN` + `next`. Any failure (cancel, forged state, Google error) → 303 to `/login?error=google`. |

User JSON: `{ id, email, display_name, role }`, role in snake_case.

### Sessions (`backend/src/auth/session.rs`, `db/sessions.rs`)

- Cookie `bj_session` = random UUIDv4 session id: `HttpOnly; SameSite=Lax; Path=/; Max-Age=30 days`, plus `Secure` when `APP_BASE_URL` is https.
- **Rolling**: `GET /me` extends the session and re-sends the cookie. The frontend calls it on every load (§6: auth state = `useQuery(['me'])`), so active users never expire, and other requests don't write to the DB.
- Extractors: `CurrentUser { user, session_id }` (401 without a session) and `MaybeUser = Option<CurrentUser>` (axum 0.8 `OptionalFromRequestParts`). `current.require(Role::Organizer)?` gives 403 below a role. Roles compare by privilege (`User < Organizer < SeedAdmin < Admin`).

### Google (`backend/src/auth/google.rs`)

- `oauth2` 5 authorization-code flow with PKCE; scopes `openid email profile`; profile from Google's userinfo endpoint over TLS (no JWT parsing needed).
- Outbound HTTP client in `AppState` with redirects disabled (oauth2's SSRF advice) and a 10 s timeout.
- `next` only accepts same-site paths (`/x`); `//evil.com`, `https://…`, backslashes and control characters fall back to `/`.
- Account matching (§5): by `google_sub`; else by email **only if Google says it is verified**; else create a Google-only account (email marked verified only when Google says it is, so an unverified Google email can never pre-hijack the real owner).
- **Pre-hijacking defence**: password accounts have unverified emails in v0.1, since there's no email verification. When Google links to such an account, its password is dropped and its sessions are deleted. Otherwise someone could register `victim@gmail.com` first and keep access after the real owner signs in with Google. The legitimate owner just keeps using Google.

### Other

- `ValidJson<T>` (`api/json.rs`): deserialize + `validator` in one extractor; malformed JSON also gets the error envelope (`field: "body"`).
- `From<ValidationErrors> for AppError`, sorted by field for stable responses.
- `domain::user::{Role, User}`; the seed now uses `Role` and `auth::password::hash` (no more seed-local `UserRole`).
- Argon2 runs in `spawn_blocking`.
- `Config::secure_cookies()`; `AppState::new(pool, config)` builds the HTTP client.

## Tests

- Unit (16): role order, `require`, cookie read/format, hash/verify, Google authorize ↔ cookie round-trip, `safe_next`, plus the M3 ones.
- Integration `tests/auth.rs` (13): register → me, duplicate email (case), all invalid fields, malformed body, login ok/wrong/unknown, logout kills the session, me with no/garbage/expired cookie, Google start redirect, forged state → `/login?error=google`, Google create-then-find by sub, takeover of an unverified password account, unverified Google email creates an unverified account, no link when Google's email is unverified.
- Shared setup moved to `tests/test_app/mod.rs`.

## New crates

- `chore: add validator` — DTO validation (§5 Handlers).
- `chore: add oauth2` — Google authorization-code + PKCE (§5 Auth). Brings `reqwest` 0.12 (rustls), re-exported and reused for the userinfo call.
- `serde_json` moved from dev-dependencies to dependencies (Google profile parsing). `uuid` gains `v4` (session ids) and `serde`.

`cargo tree -d` new duplicates come from `oauth2` 5 (`thiserror` 1, `rand` 0.8, `base64` 0.22). Nothing to dedupe on our side.

## Deviations, one line each

- `Secure` is only set when `APP_BASE_URL` is https (§5 says always): browsers other than Chrome/Firefox drop `Secure` cookies on `http://localhost`. Prod is always https.
- `MaybeUser` is a type alias for `Option<CurrentUser>` rather than a separate extractor.
- Rolling refresh happens on `GET /me` only, not on every request.

## Verified locally

- `cargo fmt --check`, clippy (online and offline), `cargo test` (37 tests), `cargo sqlx prepare --check -- --all-targets`, `npm test`, `docker build` — pass.
- Real binary on a scratch DB with the seed: login as `admin@breakingjam.local` → me → logout 204 → me 401; `/api/auth/google` 303 to Google with `code_challenge`.
- **Not verified**: a real Google sign-in. It needs your browser and Google credentials (see below).

## Try Google sign-in yourself

1. Reset the dev DB (pending since M3): `(cd backend && sqlx database reset -y && cargo run --bin seed)`.
2. In the Google console, the OAuth client's authorized redirect URI must equal `GOOGLE_REDIRECT_URL` in `backend/.env` (e.g. `http://localhost:8080/api/auth/google/callback`). Set `FRONTEND_ORIGIN=http://localhost:5173`.
3. `cd backend && cargo run`, then open `http://localhost:8080/api/auth/google`. You should land on `http://localhost:5173/`, and `http://localhost:5173/api/auth/me` should show your account.

## Deferred

- Expired session rows are filtered, never deleted; add a cleanup when the table grows.
- Rate limiting on login/register: not in §5; worth adding before launch.
- Email verification for password accounts: not in v0.1 scope.
- `utoipa::ToSchema` on the DTOs → milestone 8.
