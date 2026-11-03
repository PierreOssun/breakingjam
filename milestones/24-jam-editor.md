# Jam editor (M24)

The organiser's jam form becomes the jam page in edit mode. The brief came with three mockups on 2026-11-01: the desktop editor; the mobile start sheet, venue block, battle sheet and checklist; and draft beside visitor.

## How it works

- **Start sheet.** "Register a jam" asks for the jam name and the first day. "Create the jam page" opens the new draft in edit mode, and its URL and generated flyer work from then on.
- **Editor.** A bar under the header shows Draft, "Saved" and Preview. The flyer has an "Upload flyer" pill.
  - Filled fields (title, dates) have a light dashed outline with an "Edit" pill.
  - Each empty part is a dashed card with "+ Add": Venue (required), Battles (required), Lineup, About, Links. Chips add the last day and the times.
  - The organiser is the account, with "Change".
- **Editing in place.** A block opens where it sits and everything saves as you type. "Done" closes it.
- **Venue.** A place search with suggestions, a pin to drag to the exact door, and the city and country taken from the address.
- **Battle sheet.**
  - Category chips: 1v1 Bboy, 1v1 Bgirl, 1v1 Open, 2v2, Crew, Kids, Footwork, Powermove.
  - Format chips: Top 8, Top 16, Top 32, 7 to Smoke, Showcase.
  - Then start time, max dancers, an optional prize, and **Add battle**.
- **Publish.** A checklist: name, dates, city and map pin, at least one battle. On desktop it is a card under the flyer; on phones, a sticky "Publish · 2 left" bar that opens the same list. Each missing item has an "Add" link to its block.
- **Visitors** see only the parts that are filled in.

## Decisions (with the author, 2026-11-01)

- **Publish** submits to the admin review as before; the BreakingJam team publishes directly.
- **Venue suggestions** come from Photon (komoot's OpenStreetMap geocoder), because Nominatim's policy forbids autocomplete.
- **Jam times:** optional opening and closing times, with the first battle's start as the fallback.
- **Registration and edits:** battle registration stays an outside link. Edits to a live jam go public at once.
- **Organiser:** the account. Co-organisers and crews as organisers are deferred.
- **Battle chips** are presets over the existing battle fields; there is no style or category column. See ARCHITECTURE.md §4 Notes.
  - Footwork and Powermove are 1v1 Open battles named after the style.
  - Showcase is a format of its own, `showcase`, with any team size or none (decided with the author on 2026-11-03, migration `20261103000000_battle_format_showcase`). `na` already marks the 55 imported crew battles of unknown size and can't hold a team size. A first try that made Showcase a battle *name* failed review: a typed "Winter Showcase" could not be unpicked, and the Showcase and Footwork chips overwrote each other's name.
  - Prizes stay structured: a currency, then up to three amounts.

## Steps

1. Migration (nullable city and country, opening and closing times), the checklist enforced on submit and publish, the start sheet, the editor page with blocks and autosave, the checklist card and the mobile bar. Done 2026-11-01.
2. The venue block with Photon suggestions, the pin map, and the city and country from the address. Done 2026-11-01.
3. The battle sheet: category and format chips, "More options" for the fields no chip sets, and "Add battle" in one tap. Done 2026-11-03.
