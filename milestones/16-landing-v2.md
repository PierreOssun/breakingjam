# Landing v2: brief for Claude Code

Rework the landing page (`/`) to the v2 layout below. First update DESIGN.md as described in "DESIGN.md changes", then implement it. The reference renders are `landing-v2-desktop-dark.png` (1440 wide) and `landing-v2-mobile-dark.png` (375 wide).

**Important:** the flyers in those renders are the old pixel-art version. Use the current generated flyer (§4.24, text only) everywhere. Keep all existing data sources: upcoming jams, counts, battles by country.

## What changes, and why

1. **The hero comes first.** "Featured near you" currently sits above the hero, so the pitch and both CTAs land below the fold. Move the hero to the top.
2. **The map preview becomes a real map.** Replace the empty grid with a static MapLibre map in our dark or light style, showing real markers and clusters.
3. **Jam cards get big flyers.** Use the 4:5 grid cards with the flyer visible, and no "Published" badge on public cards. Show a status only when it matters (registration closed, cancelled).
4. **Add a "For dancers" band.** A dancer search plus a sample identity card. It's the share and claim hook.
5. **Compress "In numbers" + "Battles by country"** into one "The scene so far" strip with country chips.
6. **The organisers band gets a visual:** a generated flyer with the caption "No flyer? We make one for you".
7. **The footer gets the round Bounce logo, links and Instagram.**
8. **The header gets the new logo.** The Bounce "J" mark sits before the wordmark (DESIGN.md §10). This applies site-wide, not only on the landing page.

## DESIGN.md changes

### Replace §6 → "Landing" with:

**Landing** (order is the same on every viewport):

1. **Header.**
2. **Hero.**
   - **Desktop:** `grid grid-cols-[5fr_7fr] gap-14 items-center py-20`. One `.rings` (900px) sits behind the map, bleeding off the top right.
     - Left column, top to bottom:
       1. overline `text-label text-primary-text` "The world map of breaking jams"
       2. `display-3xl` "Every jam. One **map.**", with "map." in the blue pill
       3. `body-lg muted` pitch, max 440px
       4. hero search (§4.26) with an inline primary **Find a jam**
       5. secondary **Register a jam** + `caption` "Free for organisers"
     - Right column: map preview (§4.27) at 560px.
   - **Mobile:** the same stack with a `display-xl` headline. The search has no inline button. Below it, **Find a jam** (primary) and **Register a jam** (secondary) are full width, then the map preview at 260px.
3. **Next up near you.**
   - **Title row:**
     - Title: `display-xl` on desktop, `display-md` on mobile.
     - Location line: `body-sm muted` "Around <city> · change". Use geolocation if granted, otherwise IP; fall back to "Worldwide".
     - Link: ghost **See all on the map →**.
   - **Cards:** grid cards (§4.3), soonest first.
     - Desktop: 4 columns, first 4 jams.
     - Mobile: horizontal scroll-snap row of 240px cards, up to 6.
   - Hide the section when there are no upcoming jams.
4. **For dancers.** A `bg-surface` band.
   - **Left:**
     1. overline "For dancers"
     2. title "Every battle you've entered, on one page."
     3. one line of copy
     4. dancer search (§4.26, placeholder "Your dancer name", inline button **Find me** → `/dancers?q=`)
     5. `caption` "Not there yet? You appear automatically once an organiser lists you."
   - **Right** (max 440px): a featured verified dancer's identity card (§4.17), their stats strip (§4.15) and their 2 latest past rows (§4.14). Hide this column if no featured dancer exists.
   - Desktop: `grid-cols-[6fr_5fr]`. Mobile: stacked.
5. **The scene so far.** Replaces "BreakingJam in numbers" and "Battles by country".
   - Overline, then the counters.
     - Desktop: inline, each counter a `display-xl` number + `body-lg muted` label, separated by a muted "·".
     - Mobile: a 3-cell stats strip.
     - Counters: battles, countries, dancers.
   - Then the 10 busiest countries as country chips (§4.10), plus a muted "+N more" chip.
6. **For organisers.**
   - **Desktop:** `grid-cols-[4fr_5fr_3fr]`.
     - Column 1: overline, title "Put your jam where dancers look.", one line, primary **Register a jam**.
     - Column 2: steps 01–03 as rows with `border-b` dividers.
     - Column 3: a generated flyer at 4:5, captioned "No flyer? We make one for you from your jam's details."
   - **Mobile:** stacked, with the flyer at 112×140 next to the caption and a full-width primary CTA at the end.
7. **Footer.**
   - The round Bounce logo at 56px next to the wordmark, plus the tagline "The central place for breaking jams."
   - Links: Find a jam, Find someone, Register a jam, Instagram.
   - Language switch.
   - Desktop: one row. Mobile: stacked.

### Change §4.6 (Header): wordmark

- The home link is now the **logo mark plus the wordmark**: `flex items-center gap-2 lg:gap-2.5`, `aria-label="BreakingJam home"`.
  - **Mark:** the Bounce "J" (`frontend/public/favicon.svg`, J only, as §10 requires below 48px), `size-8` on mobile and `size-9` from `lg`, decorative (`alt=""`).
  - **Wordmark:** "Breaking" + the "Jam" pill, as before.
- It's the same on every page, including the map and jam pages.

### Change §10 (Logo): where it appears

- **Header:** the J mark at 32/36px before the text wordmark (§4.6).
- **Footer:** the full round "Jam" at 56px next to the wordmark.
- **Favicon, app icons and social:** as already listed.

### Add to §4.3 (Card)

- Public cards show a status badge only when it's exceptional: Registration closed or Cancelled. Never show Published.

### Add to §4.10 (Flag chip)

- **Country count chip:** `h-8 pl-2 pr-3`, with the flag, the country name in `font-extrabold`, and the count in `text-muted font-bold` ("Belgium 28").

### New §4.26 Hero search

- **Desktop:** `flex items-center gap-2.5 h-[60px] pl-5 pr-1.5 rounded-full border border-border-strong bg-surface shadow-lg`.
  - `MagnifyingGlass` 20 in muted.
  - Input in `text-body`, with a muted placeholder.
  - An inline primary sm button at the end.
- **Mobile:** `h-14`, with no inline button; the CTAs sit below.
- **Behaviour (v1):**
  - The landing search submits to `/map?q=`.
  - The dancer search submits to `/dancers?q=`.
  - No typeahead yet.

### New §4.27 Map preview

- **Container:** `relative h-[260px] lg:h-[560px] rounded-[28px] overflow-hidden border border-border`.
  - The whole card is a link to `/map`.
  - It uses the same MapLibre style as the map page, non-interactive: no scroll-zoom, no drag.
  - Lazy-load it below the fold on mobile.
- **Content:**
  - Upcoming jams as markers, with clusters (§7), framed on the visitor's region.
  - Desktop only: one mini popup for the soonest jam. It's a `w-[300px]` row card with a compact flyer of 64×80.
- **Overlays:**
  - Top-left chip: `h-9 px-3.5 rounded-full bg-bg border border-border shadow-md text-[13px] font-extrabold`, with an 8px `success` dot and "N upcoming jams".
  - Bottom-left: secondary sm **Open the map →** on `bg-bg`.

## Done when

- At 1440×900 and 375×812, the headline, search and both CTAs are visible without scrolling.
- Dark and light both match the tokens.
- No "Published" badge appears on public cards.
- The J mark shows in the header on every page, and the full round logo shows in the footer.
- All existing tests pass. Add a test that the landing page hides "Next up" when there are no upcoming jams.
