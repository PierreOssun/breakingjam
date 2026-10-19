# DESIGN.md update: §4.16 Avatar → Parts

Replace the **Parts** list in §4.16 with:

- **Hair (13):**
  - Short and covered: spiky · cap with side brim · beanie · buzz · afro.
  - Long and up: bun with headband · long with centre part and side fringe · space buns · box braids · afro puffs · high ponytail · blunt bob with bangs · cap over long hair.
- **Skin:** light, tan, medium, deep.
- **Hair colour:** black, brown, bleached, violet, Klein blue.
- **Hoodie:** ink, Klein, violet, white, red.
- **Extras:** none, headphones, chain.
- **Details** (optional, combinable): lash flicks · lip tint `#B4475F` · hoop earrings (silver).
- **Backdrop:** Klein, violet, ink or night, with pixel "record" rings.

Add under **Seeding**:

- No part is tied to a gender, and the schema has no gender field.
- The seed picks evenly across all 13 hair styles, and turns each detail on with a 1-in-3 chance.
- Anyone who can edit the dancer can change any part in the edit sheet.

Reference implementation: `pixel-avatar-generator.py` (`make()`, `svg()`, `PRESETS`; bgirl presets `w1`–`w8`).
