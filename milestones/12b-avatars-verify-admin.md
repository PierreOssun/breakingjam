# Milestone 12b — Generated avatars, "Verify me", dancer edit form, admin claims and merge

Build order point 12b of `ARCHITECTURE.md` §11.

## Decision (asked at the start)

- **Avatar:** the **pixel 2D-HD bust of DESIGN.md §4.16, with editable parts**, rather than ARCHITECTURE §6's DiceBear (the two docs disagreed; recorded in §4 and §6).
- Migration, as approved:

  ```sql
  alter table dancers add column avatar_parts text;
  ```

## Backend

- `avatar_parts` on dancers: readable, writable in `DancerFields`, checked as six parts in range (`h0-5 s0-3 c0-4 o0-4 e0-2 b0-3`, e.g. `h2-s1-c0-o3-e0-b1`), blank means seeded. Edits to it go to `dancer_edits` like any field.
- Claims (`POST/GET /api/dancers/{id}/claim`) add `others_pending`: someone else is claiming the same page, which the verify modal says (§6).

## Pixel avatar (`features/dancers/avatarParts.ts`, `PixelAvatar.tsx`)

- **32×32, drawn in code** to §4.16's rules:
  - 1px ink outline around the silhouette, computed from the figure
  - cel shading in two tones, lit from the top-left
  - features in a darker skin tone, never black
  - anime eyes (4px lash line, 2×2 iris, white catch-light), angled brows
  - a diagonal highlight streak in the hair, a 1px rim light in the backdrop's tint on the right edge
  - pixel "record" rings in the backdrop
- **Parts:**
  - Hair: spiky, cap with side brim, beanie, bun with headband, afro, buzz.
  - Skin: four tones. Hair colour: black, brown, bleached, violet, Klein blue.
  - Hoodie: ink, Klein, violet, white, red. Extras: none, headphones, chain. Backdrop: Klein, violet, ink, night.
  - The cap, beanie and headband take the hoodie's colour.
- **Rendering:** SVG with `crispEdges` (rows merged into about 300 rects), then the HD layer: the only gradients in the product, a top-left glow at 22% and a bottom vignette at 35%.
- **Seeding** from the dancer id (FNV-1a with a murmur finaliser), so the same id always gets the same face. A seeded hoodie never matches its backdrop.
- **A first pass:** I drew the sprites myself; an illustrator may redo them within the same part system.

## Frontend

- **Dancer page actions (§6, item 5):**
  - Visitors: nothing.
  - Logged in on an unverified page: **This is me**, which opens the verify modal (§6 + §4.19). It shows the code, the notice when someone else asked too, and **Copy code** / **Open Instagram** / **Done**.
  - Pending: the pill (§4.18), which copies the code again, with "We check by hand, usually within a day."
  - Whoever may edit: **Edit profile**, and **Add Instagram** (§4.23) when there's no handle.
  - Admins: **Merge into another dancer**.
- **Edit sheet (§6 + §4.20):**
  - Fields: name, aliases as a chip input (5), country and second country, city, the Instagram handle after a fixed `@` (pasted URLs or `@` reduced to the handle), bio with a 160 counter.
  - The avatar's six parts as selects with a live 72px preview.
  - "Edits to this page are logged until the dancer verifies it" on unverified pages. A taken handle errors on its field.
  - The dancer page now shows the bio, which nothing displayed before.
- **The account is @breaking.jam** (@breakingjam was taken): one constant feeds the DM link (`ig.me/m/breaking.jam`), the modal's copy and the admin instructions in all three languages. Updated in ARCHITECTURE §4 and DESIGN §6 too.
- **Admin, behind `RequireAdmin`; others get a not-found page.** Admins also get a **Claims** link in the header.
  - `/admin/claims`: pending claims oldest first, each with the page, an Instagram link to check, who asked (name and email), the code, **Approve** / **Reject**. 12c adds the organiser queue to the same screen.
  - `/admin/dancers/:id/merge`: the duplicate, a search for the dancer to keep, what moves and what redirects, then **Merge**, which lands on the survivor.

## Visual check (Chrome)

- **Avatars:** a sheet of every part and eight seeded faces at 112px and 288px.
- **Dancer flow:** on a phone, a new account claimed Ventus. The modal showed the code and @breaking.jam, and **Done** left the pending pill.
- **Admin flow:** the admin saw both queues, edited Ventus's skin and hair (saved, avatar redrawn), and prepared the Kid Rockett → Kid Rocket merge.
- **Found and fixed:** `pixelAvatar.ts` next to `PixelAvatar.tsx` collided on macOS's case-insensitive disk (the import resolved to the wrong file). The drawing module is now `avatarParts.ts`.
- **Caught by typed i18n keys:** the claim toast key was built as `admin.claims.${decision}d`, which made "rejectd".

## Tests

- **Backend:**
  - `avatar_parts` shape (unit).
  - Edit-log and 422 assertions, and `others_pending` for both claimants, in the existing identity tests.
- **Frontend +12:**
  - Identity flows (7): pixel avatar named after the dancer; claim, then copy, then pending; 409 explained; edit sheet with the handle URL, aliases, skin and hair in the body; claims approve; merge; admin pages hidden from others.
  - Avatar parts (4): code round trip, seeding, no clash, outline.
  - `toHandle` (1).

## Not built

- Avatar photo upload (still deferred until R2, §4).
- Role changes have an endpoint but no screen.
- No swipe-to-close on sheets.
