# Milestone 10 — Landing page (two CTAs), jam detail page, dancer page (upcoming / past jams)

Build order point 10 of `ARCHITECTURE_v0.1.md` §11.

## Decisions (asked at the start)

- **Flyer:** no "missing flyer" placeholder. Instead a **generated flyer** (DESIGN.md §4.24, from Claude Design), built server-side as SVG from data in the v0.1 schema, ported from `frontend/generated-flyer-reference.py`, used wherever a flyer goes. The same template at 1200×630 is the Open Graph image.
- **Stats strip:** built. It counts jams, countries, years active and podiums, from **past** jams only (it's a record, not plans), and is hidden when all values are 0. Recorded in §1.
- **Landing:** a static, decorative map preview card (no data). "Next up" stays out (§1). Recorded in §6.

## Generated flyer (backend)

- `backend/src/flyer.rs` ports the reference function by function: seeding, `fit_name`, pixel rings, sprite, `flyer_svg`, `og_svg`.
- **Byte-for-byte parity with the reference.** Running it as a test oracle (functions only, never its `__main__`), with the §4.24 corrections below patched in, gives SHA-1s for 6 sample jams in full, compact and cancelled variants (18) plus 6 OG images, and the Rust output matches all 24. Seeding and name fitting match on 8 ids and 12 names.
- **Corrections from DESIGN.md §4.24** where it differs from the reference script:
  - **Name room 126**, not the script's 138 ("at most 126 units from the first cap height to the last baseline"). Three-line names at 46px no longer fit and set at 40px, e.g. *Paris Cypher Sessions*, *Concrete Cypher Vol. 3*, *Seven to Smoke Night*.
  - **Accessibility:** the full and cancelled flyers are `role="img"` with `aria-label="Generated flyer: <name>, <date>, <city>"`, localised (`Flyer généré : …`, `Generierter Flyer: …`). Compact is always `aria-hidden`. The page adds no label of its own.
- Other deliberate differences from the reference, documented in the module and tested:
  - Font stacks lead with `'Unbounded Variable'` / `'Manrope Variable'`, the names Fontsource registers.
  - Quotes are escaped too, because the SVG is **inlined** into pages; the reference's `esc` would let `"` break out of an attribute. Tested with an `onload` injection.
  - The root has `xmlns`, so the file is also valid on its own.
  - **No start time:** the schema has dates only, so the time line is left out, not printed empty.
  - **OG footer:** with no battles it reads `BREAKINGJAM.COM`, not `· BREAKINGJAM.COM`. Found on the first rendered image.
  - **Category line:** fits its width ("+N"), so many battles can't overflow.
- Localised weekday, month and "cancelled" band in en/fr/de.
- `GET /api/events/{id_or_slug}/flyer.svg?compact=&lang=`: SVG, named per §4.24 (compact: `aria-hidden`). Drafts follow jam visibility (404 for others, `private, no-store` for writers); public jams are cached 5 minutes.
- `GET /api/events/{id_or_slug}/og.png?lang=`: resvg rasterises with **Unbounded and Manrope embedded in the binary** (`backend/assets/fonts`, OFL, licences included). Variable fonts work: resvg 0.48 maps `font-weight` to `wght`. Rendering runs in `spawn_blocking`. The body is documented as `string/binary` (`Png` type).

### Known reference behaviours (ported faithfully, worth a decision)

- **OG, very long names:** when no size fits in 3 lines, `fit_name` keeps one line. *"The International Breaking Championship of the Alps"* becomes **"The…"** on the share image; the 4:5 flyer handles it fine (4 lines at 24px).
- **Overlong single words** overflow the right edge on both formats; there's no hyphenation or ellipsis per word.

## Pages (frontend)

- **Landing `/`:**
  - Hero: overline, "Every jam. One **map.**" with the pill, pitch, **Find a jam** / **Register a jam**, one `.rings`.
  - The static map preview card.
  - "For organisers" steps 01–03, then **Register a jam**.
  - Only `GET /api/auth/me` is fetched (tested).
- **Jam `/jams/:slug`:**
  - Back/Share bar, then the generated flyer: full-bleed below lg; left column with a sticky registration card from lg.
  - Status badge, title, facts (dates as a localised range, venue, Instagram as `@handle`).
  - **Battles:** spots left / Full while published. Entries are ranked by `final_rank`, then stage reached; withdrawn entries are hidden.
  - Every dancer links to `/dancers/{id}`; result badges; play → YouTube nocookie modal with the offset.
  - **Lineup** chips by role, **About**, **Venue** with "Open in maps" (OpenStreetMap).
  - **Register to battle** (external, `noopener`) on desktop and in a sticky mobile bar, only while published.
  - Unknown jams and others' drafts → not-found page.
- **Dancer `/dancers/:id`:**
  - Identity card (§4.17): placeholder initial until M12b's pixel avatar, verified tick, `flag-icons` chips (never emoji), aliases, Instagram, canonical URL.
  - Crew chips (not links: no crew pages in v0.1), city, stats strip.
  - **Upcoming** and **Past** rows (§4.14): date block, flag + city, meta/role tags, result badge, play button, sticky year labels, 10 then "Show more (n)" by 20.
  - Merged dancers redirect to the survivor; bad or unknown ids → not-found page.
- Components: `StatusBadge`, `MetaTag`/`RoleTag`, `ResultBadge`, `Flag`/`FlagChip`, `VerifiedTick`, `InlineEmpty`, `ShareButton` (system share, else copy + "Link copied"), `VideoDialog`, `JamFlyer` (inlines the SVG; `compact` for renders ≤ 120px), `MapPreview`.
- `<title>` per page (React 19 hoists it). Jam and dancer pages are lazy routes.
- **Flags:** each of the 271 SVGs is its own file, fetched only when shown (`build.assetsInlineLimit` keeps them out of the bundle as data URIs).

## Visual check (real Chrome, 375px and 1280px, dark, light, French)

Run against the real API with the seed, plus data added through the API (battles, entries, results, a video, staff). No horizontal overflow, and no console errors except the expected logged-out 401 and a missing favicon. Found and fixed:

1. Landing (mobile): "Register a jam" appeared twice in the organiser band. `hidden` lost to the button's own `inline-flex`; now a wrapper does the hiding. I checked that no other place has the same conflict.
2. Landing (mobile): a decorative marker peeked out from under the "Open the map" pill.
3. Jam (mobile): the fixed register bar covered the footer (and its language switch) at the end of the page. Now `sticky` inside the article, it stops before the footer. Confirmed with viewport screenshots at the top, middle and bottom.
4. Jam: the Instagram fact showed "instagram.com"; it now shows `@handle` (`lib/instagram.ts`, tested).

## Tests

- **Backend:** 111, including 10 flyer unit tests and 3 new endpoint tests (draft visibility and cache headers, `lang=fr` text and the "ANNULÉ" band, compact, bad `lang` → 400, OG PNG 1200×630 by slug).
- **Frontend:** 84.
  - Pages: landing (no data fetching), jam (6), dancer (7).
  - Helpers: dates (locale formats, no day shift), YouTube, result mapping, stats, Instagram label.
  - Existing tests updated for lazy routes and the new landing headline.

## New dependencies

- `chore: add resvg` — rasterises the Open Graph image; only the `text` feature (no system fonts, no raster image decoding).
- `chore: add sha1` — the flyer seed is `sha1(jam id)`, as in the reference.
- npm `flag-icons` — 4:3 SVG flags (DESIGN §4.10: never emoji flags).
- Fonts: `backend/assets/fonts/{Unbounded,Manrope}-wght.ttf` + OFL licences, from google/fonts.

## Not done / follow-ups

- **OG `<meta>` tags:** the SPA can't serve them to crawlers. The Worker must inject `og:image` = `/api/events/{slug}/og.png` (recorded in §9).
- Videos from the dancer page start at 0:00: `GET /dancers/{id}/events` has no `video_offset_seconds` (§5 lists `video_url` only). Jam-page videos use the offset.
- No favicon (`/favicon.ico` 404s); DESIGN.md doesn't define one.
- Venue mini map → M11 (MapLibre). Verify me / Edit / generated avatar → M12b.
- `frontend/generated-flyer-reference.py` is untracked; it's yours to keep or move (e.g. into `docs/`).

## DESIGN.md overwritten from Claude Design (after M10 was first built)

The only differences from what M10 was built on are §4.3 ("No flyer image: render the generated flyer") and the new §4.24. Everything else matched already: inputs, viewBox, seed, palettes, layers, type, size ladder, compact, cancelled, share image, bitmaps, and the jam-page hero. Two corrections, above: name room 126, and the label on the SVG. Checked again in Chrome: the flyer is one image (the `<svg>`) named "Generated flyer: Paris Cypher Sessions, Wed 04 Nov, Paris" (French: "Flyer généré : …, Mer 04 Nov, Paris"), and the 3-line name now sits clear of the floor.
