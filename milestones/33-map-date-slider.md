# Map: choose the dates with a slider (M33)

On the map, people pick a start and an end date with a two-handle slider over the next 12 months, so they can see, for example, which jams are around Zurich in the next 6 months. It replaces the map's "Next 30 days" chip.

Built 2026-11-19 (frontend only: `features/map/range.ts`, `RangeSlider.tsx`, `DateCard.tsx`, `MapPage.tsx`; DESIGN.md §4.48). The decisions below were taken with the author after reading the brief; where they and the Design brief differ, the decisions win.

## As built (2026-11-19)

- Below 360px the dates row drops its calendar icon and the presets use `caption`, so German fits at 320px ("19. Nov. 2027", "6 Monate").
- Month labels are centred where each month starts (under the handle's place), not pinned to the card's edges.
- "{n} jams around {place}" takes the search as typed, as the brief says, so a jam name reads "around red bull".
- On a Sunday "This weekend" is that one day (From = To); dragging then keeps the handles a day apart again.

## Decisions (with the author, 2026-11-15)

- **Past jams:** the **Past jams** chip stays. While it is on, the date card is hidden: the slider never goes before today, so it can't say anything about past jams. Turning the chip off brings the card back with the range it had.
- **A text search follows the range**, like the markers, the list and the count, so they always agree. Today a search also shows past jams; from M33 those come only with the Past jams chip.
- **"This weekend" stays** as a chip: it sets the slider to the coming Saturday and Sunday (what is left of the weekend on a Sunday), as `rangeOf("weekend")` computes today. No preset lights up then. "Next 30 days" goes, as the brief says.
- **The slider is the map's only.** The Jams page (`/jams`) keeps its chips and its `?when=` links, which the landing's quick filters use.
- **Jams more than a year away** are hidden with the default range, where today the map shows every upcoming jam. There are very few; accepted.
- **The map's URL** carries the categories too (`battles=`, as `/jams` writes them), not only `from` and `to`, so a shared link opens with the same filters.

## Notes for the build

- **The map already holds every jam** (`GET /api/events.geojson`), so the range filters in the browser and there is no server change. The ~150 ms throttle while dragging only spares the clusters a redraw on every pixel.
- **No npm package.** The two-handle slider is built by hand with pointer events and `role="slider"`; two stacked native range inputs can't give Page Up/Down a month.
- **From and To** open a hidden `<input type="date">` with `showPicker()`, `min` today and `max` today + 1 year.
- **The selected preset** uses the existing "on" chip style, not the black of the mockup ("use the existing components").
- **Today** is the visitor's own date, as the map's filters use now.
- **Phones:** at 320×568 the open card covers about 40% of the map; it collapses, and a tap on the map closes it. Check with `just shots` at 320 and 375, light and dark, in German.

## UI brief from Design (2026-11-15)

Goal: on the map, people pick a start date and an end date, so they can see for example which jams are around Zurich in the next 6 months.

Reference images in `milestones/33-map-date-slider/`: `map-dates-mobile.png`, `map-dates-desktop.png`. Where an image and this text disagree, the text wins. Use the existing tokens and components; no new colours or radii.

### Behaviour

- **Range:** the slider covers 12 months, from today to today + 1 year. Two handles: From and To.
- **Defaults:** From = today (shown as "Now"), To = today + 1 year. With the defaults the map shows what it shows today for upcoming jams.
- **Steps:** handles move in steps of 1 day. They cannot cross; keep at least 1 day between them.
- **What is shown:** a jam is shown when any of its days falls inside the range (compare with its first and last day).
- **Applies to:** the map markers and clusters, the list, and the count. They always use the same range.
- **Replaces** the "This month" chip. Remove that chip.
- **Past jams** are out of scope here: the slider never goes before today.

### The control

One card with, from top to bottom:

1. **Dates row:** calendar icon, a **From** button ("Now", or a date like "3 Feb 2027" once moved), a dash, a **To** button ("15 May 2027"), and on the right the count in the primary colour: "14 jams" ("1 jam", "No jams").
   - Tapping From or To opens the native date picker for an exact date, limited to today … today + 1 year.
   - Show the year on a date only when it is not the current year.
2. **Bars:** 12 small bars, one per month of the slider, each as tall as the number of jams in that month for the current map view. Bars inside the range use the primary colour at about 50%; bars outside use the border colour. Decorative (aria-hidden).
3. **Slider:** a 6px track, the selected part in the primary colour, two round white handles (28px, 3px primary border, small shadow). Each handle needs a 44px touch area.
4. **Month labels** under the track, every second month ("Nov, Jan, Mar, …"), aligned with the bars.
5. **Presets:** four equal chips: **1 month**, **3 months**, **6 months**, **1 year**. A preset sets From = today and To = today + that length. The chip is "on" only while the range matches it exactly.

Update the map, list and count while a handle is dragged, throttled (about every 150 ms), and once more on release. Filter on the client if the map already holds every upcoming jam; otherwise debounce the request to release.

### Mobile (below the desktop breakpoint)

- **Collapsed (default):** a pill at the bottom of the map, 16px from the sides, 24px from the bottom, 52px high: calendar icon, the range as text ("Now – 15 Nov 2027"), a small tag with the matching preset name if any ("1 year"), and a chevron up. Tapping it opens the card.
- **Open:** the card replaces the pill in the same place, with a drag handle on top. Tap the handle, swipe down, or tap the map to collapse it. The pill then shows the chosen range.
- The "List" button and the "my location" button sit just above the pill or the card and move with it. The List button shows the count: "List · 14".
- When a jam popup sheet is open, hide the pill or card; show it again when the sheet closes.

### Desktop

- The card is always open, centred at the bottom of the map area, 560px wide, 28px from the bottom. No drag handle.
- The line above the list reads "14 jams around Zurich · Now – 15 May 2027" (without the place when no place is searched).

### URL and state

- Put the range in the URL as `from=YYYY-MM-DD&to=YYYY-MM-DD`, only when it differs from the default. A shared link opens with the same range.
- A `from` in the past is treated as today. A `to` beyond today + 1 year is clamped.
- Keep the range when the user searches another city or moves the map. Do not store it between visits.

### Accessibility

- Each handle is a real slider (`role="slider"`, `aria-valuemin/max/now`, `aria-valuetext` with the readable date, labels "From" and "To"). Arrow keys move 1 day, Page Up/Down 1 month, Home/End to the limits.
- The count is announced politely when it changes (aria-live), not on every drag step.
- Check light and dark themes.

### i18n

Add to every locale file: "Now", "From", "To", "1 month", "3 months", "6 months", "1 year", "{n} jams", "1 jam", "No jams", "List · {n}", "{n} jams around {place}". Dates and month labels come from the locale.

### Tests

- Defaults give today … today + 1 year and the same jams as before.
- A multi-day jam that starts before From and ends inside the range is shown.
- Presets set the right dates and light up only on an exact match.
- Handles cannot cross; keyboard steps work.
- The URL round-trips; past and too-far dates are clamped.
- Map, list and count agree after a drag, a preset and a typed date.

## Docs to update when it is built

- `ARCHITECTURE.md` §6 (map page: the date range, its URL parameters, past jams and search).
- `DESIGN.md`: the map page in §6 and the filter chips; a section for the date card and the slider.
