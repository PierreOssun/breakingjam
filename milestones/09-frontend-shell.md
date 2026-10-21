# Milestone 9 — Frontend shell: routing, i18n, auth pages, header with language switch; Tailwind from `DESIGN.md` tokens

Build order point 9 of `ARCHITECTURE.md` §11.

## Decisions (recorded in §2/§6 of the architecture doc)

- **Router: React Router 7.** §2 said "pick one". npm resolved v7.18 because v8 needs Node ≥ 22.22 (this machine has 22.18); moving later is a Node bump.
- **Tailwind v4** ("v3.4+" in `DESIGN.md`). The `DESIGN.md` §2 tokens are translated into a CSS `@theme`.
- **Where `DESIGN.md` and the architecture doc differ, the architecture doc wins on scope and routes** (CLAUDE.md): EN/FR/DE, not 8 languages; no `/en/…` URL prefix; `localStorage`, not a cookie; `/dancers/{id}`, not `/d/<slug>`.

## Done

### Design system (`src/styles/index.css`)

- `@theme` with every §2 token: 16 colours (dark default), type scale incl. `stat` and `code-xl`, radii, shadows on `--shadow-a`, `max-w-content`/`prose`/`popup`/`toast`, `h-header`/`header-lg`, `duration-fast`/`base`. Tailwind's default palette, type scale, radii and shadows are removed (`--color-*: initial` …), so only design tokens exist.
- Light theme via `[data-theme="light"]` or the OS setting when nothing is chosen (§2.4). No toggle UI yet; none is specified.
- §8 focus ring on every `:focus-visible`; `.rings` decoration utility (§9).
- Fonts self-hosted with Fontsource (Unbounded, Manrope variable; only the scripts a page needs are downloaded). No request to Google's CDN.
- **`tokens.test.ts`** parses the §2.1 colour table, §2.2 type scale and §2.3 radii from `DESIGN.md` and checks the stylesheet (dark, light, OS-light). Verified it fails on a one-character colour change.

### Shell

- `router.tsx`: `/`, `/map`, `/jams/:slug`, `/dancers/:id`, `/login`, `/register`, `/org/jams`, `/org/jams/new`, `/org/jams/:id/edit`, 404. Pages of M10–M12 render a `ComingSoon` title. `/org/*` sits behind `RequireAuth` → `/login?next=<path>`.
- Layouts: `PageLayout` (sticky header, footer) and `AppLayout` for the map (no footer, no page scroll, header not sticky) per §5. Skip link to `#main`.
- **Header** (§4.6): wordmark pill; ≥ lg nav (Find a jam, For organisers, active underline), language switch, account action, primary **Register a jam**; < lg language switch + menu button opening a full-height native `<dialog>` sheet (focus trap and Esc for free).
- **Language switch**: Globe + code, `role="listbox"` menu, options named in their own language with `lang`; ↑/↓/Home/End move, Enter/Space pick, Esc closes and returns focus, click outside closes. Opens upward in the footer.
- **Account action** (not in `DESIGN.md`, needed to log out): ghost "Log in" (with `next` = current page) or "Log out".
- Components: `Button` (§4.1 variants, sizes, loading state), `buttonClasses` for links, `TextField` (§4.2 label → control → hint/error with `aria-describedby`, `aria-invalid`), `Wordmark`, `Footer`, `ComingSoon`.

### Auth pages

- `/login` and `/register`: react-hook-form + zod, validated on blur then on input (§4.2). The zod rules mirror `RegisterRequest`; messages are translated.
- Success caches the user as `['me']` and goes to `?next=` (same-site paths only, `safeNext` mirrors the API). 401 → "Wrong email or password."; 409 → "This email already has an account."; server 422 field messages land under their field; `?error=google` (from the API callback) is explained.
- **Continue with Google** is a full navigation to `/api/auth/google?next=…`.
- Auth state: `useMe()` = `useQuery(['me'])`, `null` when logged out (§6).

### i18n

- `react-i18next`, resources bundled (en/fr/de JSON), keys namespaced by feature. Language: saved choice → first supported browser language → English; persisted in `localStorage` (`bj.lang`); `<html lang>` follows.
- **Typed keys**: `i18next.d.ts` registers `en.json`, so a wrong key fails `typecheck`.
- Key-parity test (§6) plus a no-empty-string test.

### Bundle

- Form pages are lazy routes, so zod + react-hook-form (122 KB) load only there. First download 439 KB / 139 KB gzip (was 564 / 177 before splitting). The map's MapLibre will follow the same pattern in M11.

## Tests (59, Vitest + Testing Library)

- Real route table in a memory router with a stubbed `fetch` (`src/test/app.tsx`).
- Login: validation before any request, success → `next`, 401 message, off-site `next` ignored (also in the Google link), Google failure. Register: password length on blur, success → `next`, 409 under email, server 422 under its field.
- Header: switch by click (text, `<html lang>`, `localStorage`), by keyboard (arrows, Enter, focus back, Esc), log out, log-in link carries `next`. Routing: guard redirect with `next`, 404.
- `safeNext`, translations parity, design tokens (32 checks).

## New packages

- `react-router`, `@tanstack/react-query`, `i18next` + `react-i18next`, `react-hook-form` + `zod` + `@hookform/resolvers` (§2/§6).
- `tailwindcss` + `@tailwindcss/vite` (§6), `@phosphor-icons/react` (DESIGN §7), `@fontsource-variable/unbounded` + `manrope` (DESIGN §3, self-hosted).
- dev: `@testing-library/user-event`.
- No language-detector package: detection is ~10 lines in `src/i18n/index.ts` (CLAUDE.md npm rule).

## Config notes

- `vite.config.ts`: Vitest may read `../DESIGN.md` (`server.fs.allow` gets `..` only when `VITEST` is set; the dev server keeps the default), and `test.css.include` lets the token test read the real stylesheet.
- The API client's base URL defaults to `window.location.origin` (absolute, needed outside the browser) and looks `fetch` up per call so tests can stub it.

## Verified locally

- `prettier --check`, `npm run lint`, `typecheck`, `test` (59), `build` — pass. Compiled CSS: every custom utility resolves to its token variable; no default palette.
- **Not verified**: a look in a real browser (layout, fonts, dark/light). Run `npm run dev` with the API up and check `/`, `/login`, `/register`, a narrow window for the menu sheet, and the language switch.

## Known gaps

- Build warns about two comments inside zod ("annotation that Rollup cannot interpret"): upstream, harmless.
- Translations FR/DE are mine; worth a native read before launch.
- No toast system yet (first needed by M12 forms).
