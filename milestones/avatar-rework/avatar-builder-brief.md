# Avatar builder + fighter-edition parts: brief for Claude Code

Two things, shipped together:

1. **New avatar parts** ("fighter edition"): more hair, a headgear slot, a face slot, expressions, outfits and stage effects. The theme is breaking × arcade fighting game × manga pixel art, as if you build your own fighter.
2. **A new avatar builder** that replaces the dropdowns and checkboxes in Edit profile. You pick every option by looking at it.

Everything in this folder:

| File | What it is |
|---|---|
| `reference/builder-mobile-fighters-tab.png` | Builder on mobile, "Fighters" tab |
| `reference/builder-mobile-head-tab-dark.png` | Builder on mobile, "Head" tab, dark theme |
| `reference/builder-desktop-hair-tab.png` | Builder on desktop, "Hair" tab |
| `reference/edit-profile-entry.png` | The avatar row left in Edit profile |
| `reference/fighters-12-presets.png` | The 12 starter fighters |
| `reference/new-parts.png` | Every new part |
| `avatar-generator.py` | Reference implementation of the full avatar renderer (old + new parts). **Port the pixel shapes from this file; do not redraw them.** |
| `fighter-presets.json` | The 12 presets as avatar specs |
| `avatar-fixtures.json` | Golden pixel grids for the tests (12 presets + one per new part) |

The same designs are on the canvas, in the row "Avatars — fighter edition".

Before coding, tell me how the current avatar spec is stored and rendered (field names, where the renderer lives, whether it also runs server-side), and wait for my OK on the migration in §2.

---

## 1. Avatar spec

Keep the existing fields and values. Add the new ones. All fields are enums or booleans; validate them on the server.

| Field | Values | Notes |
|---|---|---|
| `skin` | light, tan, medium, deep | unchanged |
| `style` (hair style) | spiky, buzz, afro, bun, long, bangs, pony, braids, puffs, space, **mohawk, flattop, locs, flame, sweep, highpony, bob, twintails** | 8 new. `cap`, `beanie` and `capLong` leave this list (see §2). |
| `hair` (hair colour) | black, brown, bleach, blue, violet, **red, pink** | 2 new |
| `head` (headgear) | **none, headband, bandana, bucket, hood, cap, beanie** | new slot, default `none` |
| `accent` | **white, red, blue, violet, black** | new, default `white`. Colours the headgear, mask, face paint, track stripes, jersey and bomber trim, hair ties and beads. |
| `brows` | set, **fierce** | `set` is today's brows; label it "Calm" |
| `mouth` | **smirk, grin** | new, default `smirk` (today's mouth) |
| `face` (face item) | **none, shades, plaster, scar, mask, paint** | new slot, default `none` |
| `lashes`, `lips`, `hoops` | boolean | unchanged |
| `outfit` | **hoodie, track, tank, jersey, bomber** | new, default `hoodie` |
| `cloth` (outfit colour) | ink, white, blue, violet, red | unchanged; it now colours any outfit |
| `extra` (accessory) | none, phones, chain | unchanged |
| `bg` (stage colour) | klein, violet, ink, night, **crimson, white** | 2 new |
| `fx` (stage effect) | **rings, burst, halftone, aura, city** | new, default `rings` (today's look) |

Palettes for the new colours (`HAIRS`, `ACCENTS`, `BGS`) are at the top of `avatar-generator.py`.

## 2. Migration (existing avatars must look exactly the same)

- Add the new fields with their defaults to every stored avatar.
- Caps and beanies move from hair style to headgear:

  | Old `style` | New `style` | New `head` |
  |---|---|---|
  | `cap` | `buzz` | `cap` |
  | `capLong` | `long` | `cap` |
  | `beanie` | `buzz` | `beanie` |

- Rendering rule for these two headgear values, so migrated avatars are pixel-identical:
  - `head = cap` → use the existing `capLong` drawing when `style` is `long`, otherwise the existing `cap` drawing.
  - `head = beanie` → use the existing `beanie` drawing.
  - In both cases the cap or beanie drawing replaces the hair-style drawing, as it does today.
- **Auto-generated avatars** (dancers who never edited theirs) must not change. Keep the current seeded generator as it is for existing dancers. Do not feed the new parts into it.
- Write a migration test: render every distinct stored avatar before and after, and compare the pixel grids.

## 3. Renderer

Port from `avatar-generator.py` into the existing renderer. One renderer for client and server (dancer page, menus, results, OG images).

- Grid: 32×32, `shape-rendering="crispEdges"`, same SVG structure, gradients and rounded square as today.
- **Draw order:**
  1. stage colour, then the stage effect pixels (`fx_pixels`)
  2. torso (hoodie silhouette), then the outfit (`draw_outfit`)
  3. neck, head, ears
  4. hair style (existing styles, then `draw_hair2` for the new ones)
  5. headgear (`draw_head`), which first clears the hair it covers
  6. hair and accent shading pass (existing)
  7. face: brows, eyes, nose, mouth, cheeks
  8. face item and grin (`draw_face`)
  9. lashes, lips, hoops, accessory (existing)
  10. auto outline and rim light (existing)
- Stage effects:
  - `ring` pixels use the stage's ring colour.
  - `rim` pixels use the rim colour at 55% opacity.
  - `aura` depends on the finished sprite's silhouette, so compute it after the sprite and draw it underneath.
- Functions to port: `draw_outfit`, `cap_hair`, `draw_hair2`, `draw_head`, `draw_face`, `fx_pixels`, and the `fierce` brows block inside `make`.
- **Golden tests:** for every entry in `avatar-fixtures.json`, render the `spec` and compare with the fixture:
  - `sprite`: 32 rows × 32 hex colours; `null` means transparent.
  - `fx`: the list of `[x, y, "ring" | "rim"]` pixels.
  - `background`, `ring`, `rim`: the stage colours.

## 4. The builder

### Entry point (Edit profile)

- Remove the avatar dropdowns (Hair, Skin tone, Hair colour, Hoodie, Extra, Background) and the three checkboxes from the Edit profile form.
- Leave one "Avatar" row (`reference/edit-profile-entry.png`):
  - the current avatar at 72px
  - the line "Your pixel avatar, shown on your page, in results and in menus."
  - a secondary small button **Change avatar**, which opens the builder
- The builder saves the avatar by itself. It does not depend on the Edit profile form's Save.
- Permissions are the same as editing the profile today: the verified owner, and admins.

### Container

- **Mobile (< 1024):** a full-screen sheet.
  - Top bar, 56px: close (X) on the left, the title "Your avatar", a primary small **Done** on the right.
  - Then the stage, the tabs, and the options. The page scrolls; the top bar and the stage stay pinned (the stage may shrink to a 96px avatar when scrolled).
- **Desktop (≥ 1024):** a dialog, 944px wide, `rounded-[28px]`, in two columns.
  - Left column, 300px: the title, the stage, and under it the avatar at the three sizes it's shown on the site, labelled **Page** (56px), **Menu** (36px), **Results** (22px).
  - Right column: the tabs, the options, and a footer with **Cancel** and a primary **Save avatar**.
- Closing with unsaved changes: ask inline "Discard your changes?" with Keep editing / Discard. No browser `confirm()`.

### Stage (the preview)

- Background: `linear-gradient(160deg, #101a4d, #2a1660)` with faint white rings. It is the same in light and dark themes.
- The avatar: 156px on mobile, 184px on desktop, corner radius 28% of its size, with a soft shadow. It updates instantly on every change.
- A **P1** tag on the avatar's top-left corner: `bg-primary`, white, Unbounded 11px, rotated −6°.
- A **name plate** under the avatar: a black bar skewed −10° with the dancer's name in Unbounded 18px caps, then "BBOY · CREW" in 11px accent-violet caps.
  - The role comes from the profile (Bboy / Bgirl) and the crew is the first crew.
  - Leave out what's missing.
- Two buttons under it (pills on a translucent white background):
  - **Surprise me** (dice icon): picks a random value for every slot. Face item and headgear stay `none` about half the time, so results aren't overloaded.
  - **Undo** (icon only, `aria-label="Undo"`): goes back one step. Keep up to 20 steps. Disabled when there is nothing to undo.

### Tabs and options

Six tabs, as pills in one row that scrolls horizontally on mobile: **Fighters · Hair · Head · Face · Outfit · Stage**.

| Tab | Groups |
|---|---|
| Fighters | "Start from a fighter": the 12 presets from `fighter-presets.json`, each a thumbnail with its name in caps. 3 columns on mobile, 6 on desktop. Tapping one applies the whole preset (Undo brings the previous avatar back). |
| Hair | **Style**: the 18 hair styles. **Colour**: 7 swatches. |
| Head | **Headgear**: None, Headband, Bandana, Bucket hat, Hood up, Cap, Beanie. **Colour**: the 5 accent swatches. |
| Face | **Skin tone**: 4 swatches. **Expression**: Calm / Fierce brows, Smirk / Grin mouth. **Face item**: None, Shades, Plaster, Scar, Mask, Face paint. **Details**: Lash flicks, Lip tint (on/off). |
| Outfit | **Top**: Hoodie, Track jacket, Tank top, Jersey, Bomber. **Colour**: 5 swatches. **Trim colour**: the same 5 accent swatches (it is the same `accent` value as on the Head tab). **Accessory**: None, Headphones, Chain, plus Hoops (on/off). |
| Stage | **Effect**: Rings, Speed lines, Halftone, Aura, City. **Colour**: 6 swatches. |

Option styles:

- **Thumbnail option** (styles, headgear, face items, outfits, effects, presets):
  - A live mini avatar showing the user's current avatar with that one option changed. 62px in the grids, 92px for the presets.
  - A 12px bold label under it.
  - Selected: a 2px `primary` border around the thumbnail and a round check badge on its top-right corner.
  - Grids: 4 columns on mobile, 7 on desktop.
- **Swatch** (colours):
  - A 44px round button with a 3px gap and a 2px `primary` ring when selected, and a 12px label under it.
- **On/off options** (lashes, lips, hoops, brows, mouth): the same thumbnail style, toggled by tapping.
- Group labels: 12px, extrabold, caps, muted.
- Render thumbnails only for the active tab, and memoise them. A tab shows up to about 20 avatars.

### Saving

- **Done** / **Save avatar** saves the spec through the existing profile update endpoint (or a dedicated `PUT` for the avatar), then closes and shows the toast "Avatar saved".
- On error, stay open and show the error inline.
- After saving, every place that shows the avatar updates (page, header menu, results).

## 5. Labels (i18n, all languages)

- Hair styles: Spiky, Manga spikes, Side sweep, Buzz, Mohawk, Flat top, Afro, Locs, Top bun, Long, Bangs, Bob, Ponytail, High ponytail, Twin tails, Braids, Puffs, Space buns
- Hair colours: Black, Brown, Bleach, Red, Pink, Blue, Violet
- Headgear: None, Headband, Bandana, Bucket hat, Hood up, Cap, Beanie
- Accent colours: White, Red, Blue, Violet, Black
- Face items: None, Shades, Plaster, Scar, Mask, Face paint
- Outfits: Hoodie, Track jacket, Tank top, Jersey, Bomber
- Stage effects: Rings, Speed lines, Halftone, Aura, City
- Stage colours: Klein blue, Violet, Ink, Night, Crimson, White
- Preset names stay as they are in every language: Rook, Volt, Onyx, Dash, Flint, Mako, Riot, Lynx, Ember, Nyx, Koko, Pixel.

## 6. Accessibility

- Tabs: `role="tablist"` / `tab` / `tabpanel`, arrow keys move between tabs.
- Each single-choice group is a `radiogroup`; options are `radio` with their label as the accessible name. On/off options are checkboxes or `aria-pressed` buttons.
- The dialog traps focus, closes on Esc (with the discard question if needed), and returns focus to "Change avatar".
- The preview has a text alternative that lists the main choices, e.g. "Pixel avatar: manga spikes, bleach hair, headband, tank top".
- Touch targets ≥ 44px. Light and dark both work.
- Respect `prefers-reduced-motion`: no bounce when the preview changes.

## 7. Originality rule

All parts and presets are original. Do not add parts, presets, names or colour combinations that copy a character from an existing game, anime or manga.

## 8. DESIGN.md

- Avatar section: the new slots, values and palettes, the draw order, and the migration rule for caps and beanies.
- New components: the avatar builder (stage, P1 tag, name plate, tabs, thumbnail option, swatch), and the avatar row in Edit profile.

## 9. Tests

- Golden render tests from `avatar-fixtures.json` (§3).
- Migration: old avatars render pixel-identical; `cap`, `capLong` and `beanie` map as in §2.
- Auto-generated avatars of existing dancers are unchanged.
- Server validation rejects unknown values.
- Builder:
  - picking an option updates the preview and the selected state
  - a preset applies every field
  - Undo restores the previous spec, up to 20 steps
  - Surprise me always produces a valid spec
  - Done saves and updates the avatar on the page
  - closing with unsaved changes asks before discarding
  - the Head and Outfit tabs share the same accent value

## Done when

- The builder matches the reference images on mobile and desktop, in light and dark.
- All 44 fixtures pass.
- No existing dancer's avatar looks different after the release.
- The old dropdowns and checkboxes are gone from Edit profile.
