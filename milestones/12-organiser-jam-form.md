# Milestone 12 — Organiser jam form; dancer and crew pickers with search-before-create

Build order point 12 of `ARCHITECTURE_v0.1.md` §11. Built in one session with 12b and 12c, at the author's request.

## Decision (asked at the start)

- **Location:** address search with **OpenStreetMap Nominatim**, then adjust the pin. **Find on the map** searches the typed address, city and country on that click only (Nominatim's policy forbids as-you-type), at most once a second, with attribution under the field. It drops the pin on the best match, lists the others, and fills an empty city or country. The pin can then be tapped or dragged on a small map. Recorded in ARCHITECTURE §6.

## Backend

- `GET /api/events/{id_or_slug}` adds `can_edit` (`EventResponse`). The edit page shows someone else's jam as not found, and the jam page shows **Edit jam** to its writers. Tested for owner, `seed_admin`, stranger and anonymous.

## Frontend

- **`/org/jams`:** your jams, drafts included, as rows (date block, name, flag and city, status badge) that open the editor; paged with **Show more**. With no jams, the §4.7 empty state (`Ticket`).
- **`/org/jams/new`:** the jam form, then **Save draft** opens the editor. The first jam makes the account an organiser, so `me` is refetched.
  - Fields: name, first and last day (native date inputs), timezone (every IANA zone, defaulting to the browser's), venue, address, city, country (all ISO countries, named in the UI language), the location, about (counter out of 5000), registration link, Instagram page.
  - The client rules mirror `EventFields`; server field errors land on their fields, the rest above the button. On phones the button sits in a sticky bar (§5).
- **`/org/jams/:id/edit`:**
  - **Status card:** the one step forward (Publish, Close registration, Mark as completed), **Cancel jam** and **Delete jam**, both confirmed in a dialog. A notice when there's no pin.
  - **Details:** the same form, saved with `PUT`.
  - **Battles:** add, edit, move up or down, delete (confirmed; entries go too). The battle dialog has format, size, open to, the age preset (Kids with an editable lower bound, Adults, Masters, Not specified), bracket and spots. The name is optional, and its placeholder is the name the server will generate, mirrored and tested against the API's examples.
  - **Entries** per battle, folded until opened: members, team name and crew (for teams), registration status, result, exact place, YouTube link and start time (`1:02:03`, `2:15` or seconds).
  - **Lineup:** pick a role, search a dancer; each change saves the whole list.
- **Search-before-create** (`SearchPicker`, shared by dancers and crews): results while typing (debounced), each line `name ✓ · @handle · country · crew · city` (§4). **Create a new …** stays disabled until a search has run. Creating a dancer asks only for name, country and an optional handle; a taken handle says to search for it.
- **Shared pieces built here:**
  - `Dialog` (§4.9: bottom sheet below lg, centred from lg; native `<dialog>`; unsaved edits are confirmed before closing)
  - Toasts (§4.8: queued, errors stay, entrance animation and its reduced-motion version)
  - `SelectField`, `TextAreaField` with counter, `InlineNotice` (§4.21), `IconButton`, `OptionalLabel` (§4.20), `DateBlock` and `JamRow` (§4.14)
  - `splitFieldErrors` for server errors
- **Cleaned up on the way:**
  - The map page's own error toast now uses the shared one.
  - MapLibre's setup (worker, pmtiles, theme-aware style) moved to `features/map/maplibre.ts` for both maps.
  - `ComingSoon` was deleted; every page now exists.
  - The dancer page's date block is shared.

## Visual check (Chrome, 1280px and 375px)

Run against the real API on a scratch database. I registered an organiser and created "Concrete Cypher Vol. 4" through the form. The real Nominatim search for "Seestrasse 395, Zurich" found the Rote Fabrik's Shedhalle, pinned it and listed four alternatives. Then I added a 1v1 Bboy battle, entered Kid Rocket from a search, added Atlas as judge and published. No unexpected console errors; nothing overflows. Found and fixed:

1. **Dialogs could lose what you just typed** (found here; it affects 12b and 12c too). Each form dialog reset itself to the item being edited in a `useEffect`. On a busy page that ran after the first input: the battle's "Open to" went back to *Everyone*, and an organiser's new handle was lost. The reset is now a layout effect in all four dialogs, so it lands before the dialog shows.
2. **The battle summary** read "Battle · 1v1 · …"; "1v1" already says it, so the word now shows only for other formats.
3. **Search results** said the country twice to screen readers (flag alt, then "FR"); the flag is decorative there now.

## Tests

- **Frontend +18:** organiser pages 8, field mapping 8, Nominatim 2.
  - Organiser pages: list, empty state; new jam with validation, address search, country fill, pin and body; someone else's jam; publish, then save details; battle named from its fields; search-before-create then entry; judge from a search.
  - Field mapping: blanks to null, battle names matching the server's, presets, entry body, start times, entry labels.
  - Nominatim: request parameters and parsing, failure.
- **Test infrastructure:** `mockApi` replies can vary per call, `bodyOf` reads request bodies, and string URLs work as `fetch` input. Testing Library's wait is 5 s: lazy pages took over 1 s to transform when all files ran in parallel.
- **Backend:** `can_edit` assertions in the existing draft-visibility test.

## No new dependencies.
