# Event page v2: requirements for Claude Code

The jam page (`/jams/<slug>`) is the most shared page. Improve it for people arriving from Instagram or WhatsApp on a phone, and make sharing it easy. Keep the existing data and sections. References: `event-v2-mobile-light.png` and `event-v2-desktop-light.png`.

## 1. First screen (mobile 375×812)

- The flyer stays first, but inset: `mx-4 rounded-lg`, 4:5. It's no longer full-bleed.
- Under it:
  1. The status badge + a **countdown chip** ("In 9 days", "Tomorrow", "Today", "Live now"; hidden once the jam is completed). Style: `text-caption font-extrabold uppercase`, `text-primary-text bg-primary/[.12] border border-primary-text/50 rounded-full h-6 px-2.5`.
  2. Title: `display-lg` on mobile, `display-2xl` on desktop.
  3. **Meta lines**, each with a `primary-text` icon:
     - date + start–end time
     - flag + city, country
     - total cash prizes, "€1,750 in prizes" (sum of all battle prizes; hidden if none)
  4. **"Who's in" card** (new): a stack of the first 6 avatars (36px rounded squares, overlapping by 10px with a 2px `bg` ring), then "10 dancers in" (bold) and "2 judges · DJ Krate" (muted), then an arrow.
     - The whole card is a link that scrolls to Battles.
     - Hide it when nobody is listed.

## 2. Sticky action bar (mobile only)

- `fixed bottom-0 inset-x-0`, `bg-bg border-t shadow-lg px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]`.
- Two buttons: secondary **Share** (`flex-1`) and a primary action (`flex-[2]`).
- The primary action depends on the state:
  - Registration open → **Register to battle**
  - Registration closed → **Add to calendar**
  - Completed → **See results** (scrolls to Battles)
  - Cancelled → no primary button, only Share
- **Add to calendar** downloads an `.ics` file for the jam: title, start/end, venue address, page URL.

## 3. Desktop layout

- Same `grid-cols-[420px_1fr] gap-14`.
- The left column is `sticky top-6` and holds the flyer + an **action card** under it:
  - `bg-surface border rounded-lg p-5 gap-3`
  - the primary action (same rules as §2)
  - secondary **Share this jam**
  - a caption, e.g. "Spectators welcome · entries are full"
- This fills the empty space under the flyer.
- The right column holds the badges, title, meta (desktop: one inline row), the "Who's in" card, then the facts grid (When, Where, Website, Email) and the sections below.

## 4. Battles

- Each battle is a card: `bg-surface border rounded-lg p-5`.
- **Header:**
  - name in `display-sm`
  - "Starts 14:00" and "8 / 16 dancers" with icons, muted
  - the prize line with the `Trophy` icon, if any
  - the format as a meta tag on the right ("Top 8", "Showcase", "7 to Smoke")
- **Entries:** dancer chips in a **wrapping row** (`flex flex-wrap gap-2`), not one chip per full-width row. This is the biggest space win.
- **Completed jams:** chips are ordered by result, and the top 3 get a result badge (§4.13) inside the chip.

## 5. Lineup

- **Desktop:** groups side by side (Judges | DJ | MC). **Mobile:** stacked.
- Each group is a `lbl` label and a wrapping row of dancer chips.

## 6. Venue

- A static mini map (MapLibre, non-interactive, same style as the map page), 220px tall on desktop and 170px on mobile, `rounded-lg`, with the selected marker centred.
- Under it: the address, and a secondary sm **Directions** button that opens Google Maps or Apple Maps.
- If there are no coordinates, show the address only.

## 7. Organiser

- A card with:
  - a 52px rounded-square initials avatar, or the logo when one exists
  - the name in bold
  - "N jams on BreakingJam · @instagram" in muted
  - a secondary sm **Contact** button (`mailto:`)
- **Mobile:** it wraps, and the button goes full width.

## 8. More jams coming up (new, bottom)

- Up to 4 upcoming jams, the nearest first, excluding this one. Use grid cards (§4.3): 4 columns on desktop, a horizontal scroll of 200px cards on mobile.
- Add **See the map →**.
- Hide the section if there are no other jams.

## 9. Share (simple, for now)

- The **Share** buttons (the mobile action bar, the desktop action card, and the top bar) all share the page URL:
  - When `navigator.share` exists (mobile, Safari), call it with `{ title: "<Jam> · <Wed 4 Nov> · <City>", url }`. A user cancelling the share is not an error.
  - Otherwise, copy the URL to the clipboard and show the toast "Link copied" (§4.8).
- No share sheet and no story image yet. Those come later with the image generator.
- **Open Graph** (check it's in place, so shared links look good):
  - `og:title` is "<Jam> · <Wed 4 Nov> · <City>".
  - `og:description` is the categories + "on BreakingJam".
  - `og:image` is the current flyer/share image.

## 10. Remove or merge

- On mobile, the Website and Email facts move into an "Info" section below About. On desktop they stay in the facts grid.
- The top bar keeps ← Map and Share. On mobile, Share is an icon button.

## DESIGN.md

- **§6 Jam detail:** replace with the structure above.
- **New components:**
  - §4.28 Countdown chip
  - §4.29 "Who's in" card (avatar stack)
  - §4.30 Sticky action bar (state → primary action table)
- **§4.12 Dancer chip:** entries in a battle use a wrapping row.

## Done when

- At 375×812, the flyer, badges, title, date, city and the action bar are visible without scrolling.
- Share opens the native share on iOS Safari and Android Chrome, and copies the link with a toast on desktop.
- "Add to calendar" imports correctly into Google Calendar and Apple Calendar.
- Pasting a jam link into WhatsApp shows the OG image and title.
- Light and dark both work.
- Existing tests pass. Add tests for the countdown text and for the action-bar state logic.

## Built: decisions where the brief left a gap (Claude Code)

- **No reference images** were in the repo (`event-v2-mobile-light.png`, `event-v2-desktop-light.png`): built from this text.
- **DESIGN.md numbering:** §4.28 and §4.29 were taken (flyer upload, loading placeholders), so the new components are §4.30 Countdown chip, §4.31 "Who's in", §4.32 Action bar and card.
- **Start–end time:** jams have days, not times. The date line adds the first announced battle start ("from 14:00"); there is no end time.
- **Add to calendar** is the API's `GET /api/events/{slug}/calendar.ics` (one all-day event, RFC 5545, `src/calendar.rs`), which iOS and Google import more reliably than a file made in the browser.
- **Action bar:** `sticky`, not `fixed`, so it stops before the footer instead of covering it; it looks the same while reading. Published without a registration link → **Add to calendar**. The captions are in DESIGN.md §4.32.
- **Battles:** visitors see the wrapping chip rows; the organiser keeps a row per entry, which holds the edit, delete and video buttons. Only the podium gets a badge on the visitors' chips. "8 / 16 dancers" counts teams for team battles. The format tag is "7 to Smoke" or "Top N" (the bracket size); there is no showcase format in the data.
- **Organiser card:** initials (no logos yet). "N jams" counts their public jams (`OrganizerRef.jams`). **Contact** writes to the jam's public email, else opens the Instagram DM as before.
- **Open Graph:** the description lists the battle names; the image is the uploaded flyer at 540×675 when there is one (small enough for messengers), else the 1200×630 share image.
- **Also asked:** a "One-day jam" checkbox on the jam form, showing a single date.

