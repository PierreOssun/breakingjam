# Milestone 11 — Map page

Build order point 11 of `ARCHITECTURE.md` §11.

## Decisions (asked at the start)

- **Filters:** *When* (this weekend, next 30 days) and *battle categories*. No Past or Cancelled filters, so the map stays upcoming jams (`published`, `registration_closed`), as `events.geojson` already returns.
- **Search:** jams by name, city or country, client-side, then fit the map to the matches.
- Both recorded in ARCHITECTURE §6 Map.
- **Style package:** `@protomaps/basemaps`. The doc named `protomaps-themes-base`, which is deprecated and replaced by it; §2 and §6 updated.

## Backend

- `domain::battle::Category` (`one_v_one`, `two_v_two`, `crew`, `seven_to_smoke`, `bgirl`, `kids`) and `Battle::categories()`:
  - From the structured fields: team size 1 / 2 / 3+ → 1v1 / 2v2 / crew; the seven-to-smoke format; `bgirl` gender; `kids` age.
  - A 1v1 Bgirl Kids battle counts for all three. Unit-tested.
- `GET /api/events.geojson` properties gain:
  - `ends_on` and `status`, for the time filter and the popup's badge.
  - `battles`: names in display order, the popup's category line.
  - `categories`: all battles' categories without repeats, what the chips match.
  - Battles come in one query for all jams (`db::battles::of_events`, `event_id = any($1)`).
- OpenAPI snapshot, `.sqlx` and `schema.d.ts` regenerated.

## Frontend

- `/map` is a lazy route in the app shell (no footer, no page scroll). MapLibre and its worker load only there.
- **Map (`features/map/JamMap.tsx`):**
  - Style (`style.ts`): Protomaps basemap recoloured to DESIGN §7 in each theme, following `data-theme` or the OS setting.
    - Labels are in the UI language; road labels show from zoom 13.
    - No sprite: POI, shield and one-way layers are dropped, and city labels keep their names but lose their town dots.
  - Tiles: the hosted API with `VITE_PROTOMAPS_KEY`, or `pmtiles://` when `VITE_TILES_URL` is set (protocol registered).
  - Clustered GeoJSON source (radius 48, up to zoom 12) with HTML markers:
    - Each marker is a 44px button around a 20px dot, labelled "name, date, city", with a `marker-ring` token for the §7 ring colours.
    - The selected marker is 28px with `shadow-selected`. Date tags show from zoom 12, and always on the selected marker.
    - Clusters are sized 36/44/56 with "120+" / "1k+" labels; a click fits the map to the cluster's jams.
    - The selected jam keeps its marker even inside a cluster.
  - Popup (≥ lg): 320px with a caret, 8px above the marker.
    - It sits outside MapLibre's canvas, so clicks, drags and wheel turns in it never reach the map.
    - It follows the marker as the map moves. The map auto-pans so the popup and marker are in view, clear of controls and the phone sheet, and waits for any camera move in progress.
  - Zoom and locate group top-right (≥ lg). Attribution is bottom-right and always expanded, in the page's colours.
  - Reduced motion: every camera move jumps.
- **Page (`routes/MapPage.tsx`):**
  - **≥ lg:** a 400px side panel with search, wrapped chips, "N jams in this area" (live region) and row cards. A row shows its jam on the map (`aria-current`) and scrolls into view when its marker is picked.
  - **< lg:** full-bleed map with the floating search pill, a filter button (violet dot, "Filters, 2 on"), a scrolling chip row, and **List** / locate pills 16px above the sheet.
    - The selected jam opens in a bottom sheet with the distance once located, **View jam** and icon **Share**.
    - **List** is a full-screen list of row links (the map is `inert` behind it) with a **Map** pill.
    - The filter button opens a bottom-sheet dialog with grouped chips, **Clear** and **Show N jams**.
  - Popup and sheet: `role="dialog"` named by the title. Focus goes to the title on open and back to the marker or row on close. They close with ✕, Esc or a tap on the map.
  - Empty state (§4.7): in the panel, the list, or as a sheet on phones when filters or a search leave nothing in view. **Clear filters** (clears search too) and **Register a jam**.
  - Search: Enter fits to the matches (max zoom 13) and opens the jam when there's only one. Emptying the field brings everything back.
  - The first view fits all jams.
  - Locate uses `navigator.geolocation` and shows a violet dot. A failure shows an error toast (§4.8) that stays until dismissed.
- Pure, tested helpers: `jams.ts` (filters, weekend range, search folding, bounds, cluster labels, distance) and `view.ts` (de-duplicating `querySourceFeatures`, antimeridian bounds, auto-pan offsets).
- Supporting changes:
  - `ShareButton` takes `url` and `iconOnly`.
  - `JamFlyer` takes `lazy`: it fetches near the viewport only, which matters for long row lists. `updated_at` is optional.
  - `formatShortDateRange` ("Sat 17 Oct") for date labels.
  - `useMediaQuery`.
  - `map.*` strings in en/fr/de.

## Visual check (real Chrome, 375px and 1280px, dark and light)

Run against the API with a scratch database: the seed plus battles, and 28 more published jams added through the API so there are clusters. Tiles and glyphs load (200), and nothing overflows horizontally. The only console errors are the expected logged-out 401 and the missing favicon. Checked:

- Clustering, and a cluster click (34 → 28 jams in view).
- Date tags at zoom 13 (2 of 2 markers).
- Search "switzerland" (7 in view).
- Popup and sheet, list, filter sheet, empty state.
- Keyboard: Tab to a marker shows the focus ring, Enter opens the popup, Esc returns focus to the marker.

Found and fixed:

1. **The map didn't draw at all.** MapLibre 6 loads its worker (`maplibre-gl-worker.mjs`) from next to its own module, but Vite moves that module: pre-bundled in dev, hashed in the build. The worker 404'd and nothing rendered; the production build didn't even contain the worker file. The fix imports it as a `?url` asset and calls `setWorkerUrl`; the build now emits `maplibre-gl-worker-*.mjs`. jsdom tests can't catch this, so I noted it in ARCHITECTURE §6.
2. Phone: the locate pill touched the attribution when no sheet was open. It now sits 32px up, and 16px above any sheet.
3. Popup and sheet title: opening by keyboard showed a focus ring on the heading. It's a focus target, not a control, so it has none now.

## Tests

- **Backend:** 113, including the GeoJSON properties test (ends_on, status, battles in order, categories) and `Battle::categories`.
- **Frontend:** 115. New:
  - Map page (10, map mocked): in-view count and first framing; category and weekend filters (fake date); search by country and city with accents, framing and the single-match popup; empty state and Clear filters; desktop popup with Esc and focus return; phone sheet with distance, Share and focus return; the list view as links; the filter sheet; locate failure; load failure.
  - Helpers: `jams` (7), `style` (4), `view` (9), short dates (1).

## New dependencies (npm)

- `maplibre-gl`: the map engine (§2).
- `react-map-gl`: React bindings in MapLibre mode (§2).
- `@protomaps/basemaps`: the Protomaps style layers we recolour (§2; replaces the deprecated `protomaps-themes-base`).
- `pmtiles`: the `pmtiles://` protocol for self-hosted tiles (`VITE_TILES_URL`, §6).

## Follow-ups and known limits

- **Swipe down** to close the sheets (§4.4, §4.9) isn't built; ✕, Esc and a tap on the map or scrim work.
- **Glyphs** come from `protomaps.github.io`. Self-host them with the tiles (§9).
- **Leaving and coming back** reframes all jams; camera, filters and search aren't kept. They could go in the URL.
- **Phones:** when jams span from the Americas to Australia the whole set can't fit 375px at the minimum zoom, so the first view centres on the middle of the set.
- While the phone sheet is open it covers the attribution.
- The light map keeps Protomaps' green for parks and woods; §7 doesn't specify them.
- **Bundle:** the map chunk is 1.19 MB (324 kB gzip) plus a 508 kB worker, and Vite prints its 500 kB chunk warning. Both load only on `/map`, and none of it reaches the main chunk (checked).
