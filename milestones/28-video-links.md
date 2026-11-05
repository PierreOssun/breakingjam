# Video links (M28)

Battle videos were play icon buttons, on the dancer page's rows (upcoming ones included) and beside the jam page's entries. Nothing told a visitor which jams had videos before opening them. M28 gives videos one look in two places. Agreed with the author on 2026-11-05.

## Decisions

- **Battle results: a "▶ Video" pill** (DESIGN.md §4.37).
  - Where: a dancer page's past rows, and a jam's Battles section, for visitors and for the organiser's rows.
  - Order: the pill, then the result; on phones the pill goes under the result.
  - It opens the YouTube player in a modal at the entry's start time, as before. The brief said "new tab"; the author kept the in-site player.
  - No video, no pill. Upcoming and live rows never have one.
- **Several videos ("Videos · n" with a menu or sheet) wait.** An entry has one video (`entries.video_url`), and every row shows one entry. The design is kept in §4.37 for when matches get videos.
- **Jam previews say "Videos available"** when a battle of a live or past jam has a video. The whole preview then opens the jam at `#battles`, and the jam page scrolls there once the battles load. The chip is never a link of its own.
  - Grid cards: the chip on the flyer, as in the brief.
  - Map popup and side panel (64–72px thumbnails): a ▶ badge with "Videos available" for screen readers.
  - `/jams` and search rows, which have no flyer: a "▶ Videos" chip at the end of the row.
  - Landing "Next up" and "More jams coming up" only hold upcoming jams, so they never show it.
- **One API field:** `has_videos` on `GET /api/events.geojson`, which every preview reads. It is true when a battle has an entry with a video that isn't withdrawn, and never for an upcoming jam.

## Steps

1. API, frontend, docs — done 2026-11-05.
