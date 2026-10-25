# Milestone 19 — Jam flyer upload

The author asked how best to upload a jam's banner (the "battle banner": the jam's 4:5 flyer, one per jam), for a screen to crop it, the formats and limits, and where it is hosted. The plan was researched and mocked up first (the "Flyer Upload" canvas, DESIGN.md §4.28), then built.

## Decisions

- **Moderation:** a flyer goes live as soon as it is saved, with no review; admins remove unsuitable ones from the jam's editor. New jams are already reviewed (M14), and a flyer swap is usually a lineup update.
- **Formats and limits:** PNG or JPEG (`.png`, `.jpg`, `.jpeg`), at most 20 MB, at least 540 × 675 px. iOS Safari turns HEIC photos into JPEG when the picker asks for JPEG.
- **The browser does the image work:** crop to 4:5, then two JPEGs at quality 0.85 (lowered if over the limit): 1080 × 1350 for the jam page (Instagram's portrait size, where most flyers already are) and 540 × 675 for cards, lists and the map. JPEG, not WebP: Safari can't encode WebP from a canvas. Re-encoding drops EXIF and GPS. The server has no image library.
- **Hosting:** Cloudflare R2, one bucket per target, served on its own domain (`media.breakingjam.com`, `media-uat.breakingjam.com`). The API writes through the Worker's outbound handler (Containers can reach Worker bindings since March 2026), so it holds no R2 keys and signs no S3 requests.
- **Schema:** two URL columns rather than one key, like `dancers.avatar_url`, so every query that returns a jam carries its flyer with no URL building in handlers. This differs from the one-column SQL shown during research.

## Built

- **Migration** `20261025000000_event_flyer.sql`: `events.flyer_url`, `events.flyer_card_url`, both null or both set.
- **API** (`api/flyers.rs`): `POST /api/events/{id}/flyer` (multipart `flyer` + `card`) and `DELETE /api/events/{id}/flyer`, for the jam's writers (owner, `seed_admin`+). The writer check comes before the body is read. Each part must be a JPEG of the exact size (frame header read in `media::jpeg_size`, no crate) and under its limit (2 MB, 400 KB); the route's body limit is their sum plus 64 KB.
  - Keys are new per upload (`flyers/{event}/{uuid}.jpg`, `-card.jpg`), stored with `Cache-Control: public, max-age=31536000, immutable`.
  - Replacing or removing a flyer, or deleting its jam, deletes the old objects in a spawned task, both at once, so a request dropped after the save still deletes them. `set_flyer` reads the flyer it replaces under the row's lock, so overlapping uploads each delete exactly what they replaced. A failed delete only leaves files behind (found by `/code-review`).
  - Tests wait for those deletes: `tokio`'s `time` feature is on for dev-dependencies.
  - `MEDIA_STORE_URL` and `MEDIA_PUBLIC_URL` are new required settings. `axum`'s `multipart` feature is on (it pulls `multer`).
  - `GET /api/events.geojson` carries `flyer_card_url`.
- **Worker:** `deploy/src/media.ts` (PUT, DELETE, and GET for development) behind `Api.outboundByHost["media.internal"]`; `ContainerProxy` exported; R2 bindings and `MEDIA_PUBLIC_URL` per target. `Api.outboundByHost` is assigned after the class: a `static` field would bypass the library's setter and the handler would never be registered.
- **Development:** `just media` runs the same handler on a local R2 bucket at :8788 (`deploy/wrangler.media.jsonc`); `just dev` starts it with the rest.
- **Frontend:** the editor's Flyer section (`FlyerEditor`), the crop dialog (`FlyerCropDialog`, no crop library), the geometry in `flyerCrop.ts` (unit-tested), and `JamFlyer` showing the upload in place of the generated flyer.
  - The jam page shows the same controls under the flyer to whoever may edit the jam (asked for after the first build): `FlyerActions`, sharing the picking, cropping and uploading hook of the editor's section. Its cache update covers the jam by id (editor) and by slug (jam page).
- **CSP:** both media hosts in `img-src`.

## Before deploying

Create each target's bucket and connect its domain (deploy/README.md, step 11). Add the two `MEDIA_*` lines of `backend/.env.example` to `backend/.env`.
