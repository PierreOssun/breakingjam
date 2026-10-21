# Landing v3 (simple): brief for Claude Code

Make the landing page (`/`) much simpler. Use the three PNGs next to this file as references. First update DESIGN.md §6 "Landing" as described below, then implement it.

## The page, top to bottom

1. **Header** (site-wide):
   - **Left:** the J mark + "Breaking[Jam]" wordmark, then the nav: **Jam map** (`/map`), **Find a jam** (`/jams`), **Find someone** (`/dancers`).
   - **Right:** the language switch, then **Log in** (ghost, muted; when logged in: the account menu with My jams, Admin, Log out), then primary **Register a jam** with a `Plus` icon.
   - **Mobile:** J mark + wordmark, language switch, and the menu. The menu holds the 3 nav links + **Register a jam**.
   - Move "My jams" and "Admin" out of the top bar into the account menu, so the header stays four items wide.
2. **Hero: the search, and nothing else.**
   - No headline, no pitch text, no map preview, no second button.
   - Centred search pill, using §4.26 hero search at a bigger size:
     - **Desktop:** `max-w-[760px] h-20 pl-[30px] pr-2 gap-3.5`, with a `MagnifyingGlass` 24 on the left and input text at 20px.
     - **Mobile:** full width, `h-16`, input at 16px.
   - **Placeholder:** "Jam, battle, bgirl, bboy, DJ…" (localised).
   - **The submit button is the round J Bounce logo** (`favicon.svg`): 64px on desktop, 52px on mobile, `aria-label="Search"`. Hover: scale 1.04. Focus: the standard ring.
   - Submit goes to `/search?q=…`, which shows jams and people. If that page doesn't exist yet, send jam queries to `/map?q=` and people queries to `/dancers?q=`.
   - **Spacing:** `py-32` on desktop, `py-16` on mobile. One `.rings` (1120px desktop, 560px mobile) is centred behind the search.
   - The `<h1>` stays for SEO and screen readers but is visually hidden ("BreakingJam: every breaking jam on one map").
3. **Next up near you.** Keep it as it is now: title, "Around <place> · change", **See all on the map →**, 4 cards on desktop and a horizontal scroll on mobile.
4. **The scene so far.** Keep it as it is now.
5. **Footer.** Keep it as it is now.

## Remove

- The map preview.
- The hero headline and pitch.
- The second "Register a jam" button in the hero.
- The "For dancers / Every battle you've entered, on one page" band; the dancer search lives in the main search now.
- The "For organisers / Put your jam where dancers look" band. It moves to a future `/register` landing.

## DESIGN.md

- **Replace §6 Landing** with the page structure above.
- **In §4.26, add a "Hero search (landing)" size:**
  - desktop `h-20`, mobile `h-16`
  - the J logo as the submit button
  - placeholder "Jam, battle, bgirl, bboy, DJ…"
- **Delete §4.27 Map preview,** or mark it unused.

## Done when

- At 1440×900 and 375×812, the search is the first thing below the header, and "Next up near you" starts above the fold on desktop.
- The header shows exactly: logo, Jam map, Find a jam, Find someone · language, Log in or account, Register a jam.
- The J button submits the search and is keyboard-accessible, with the focus ring visible.
- Dark and light both work.
- Existing tests pass. Update any landing test that expected the removed sections.
