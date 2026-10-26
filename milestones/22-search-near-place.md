# Milestone 22 — Search near a place

The author's brief: searching a city on `/search` shows the closest jams, even when no jam is registered there ("Near <Place>"), matching the three mockups pasted in the session (Mulhouse on desktop and mobile, Reykjavik with no jam near). `docs/search-near/*.png` was not in the repo.

## Decisions

- **Data:** GeoNames `cities15000` (34,188 cities, CC BY 4.0), trimmed to the eight columns the brief names and committed as `data/places/cities15000.tsv` (6.8 MB), so no import downloads anything. `cargo run --bin data -- places` loads it; `just places` locally (`just reset-db` too), the **Import places** workflow on UAT and production.
- **Schema** (`20261026000000_places.sql`): `places` with a UUIDv7 id as the conventions ask, GeoNames' id kept unique; `place_names` holds every name folded (lower case, no accents, punctuation as single spaces), in the "C" collation so one index serves the exact and the prefix lookup. About 325,000 names, each marked `own` (the place's name or ASCII name) or not (an alternate); a lookup takes under 1 ms. After review, `20261026000001_place_names_by_place.sql` adds the `own` column and an index by place, which each import's cascading delete needs (a re-import now takes about 2 s); the first migration had already run locally, so it stays as it was.
- **Matching** (`GET /api/places?q=`): an exact name or alternate name first, own names before alternates, then a name starting with the search, the most populated either way; no lookup under 3 letters. After review, so that searches for jams and dancers stop naming cities: alternate names that are codes ("ZRH", postcodes) or under 4 ASCII letters are dropped; a prefix needs 4 letters and must cover more than half the name ("jam" no longer finds Jamshedpur, "battle" no longer Battle Creek); under 50,000 people only an exact own name of 4+ letters finds the place ("India" no longer finds Inđija). Still: "mulh" finds Mülheim (more populated than Mulhouse), "victor" Victorville, "pari" Pari (Brazil).
- **The jams** are picked in the browser from the map's GeoJSON: the 3 nearest upcoming within 500 km. A jam is "in" the place when its city has the place's name (same country) or it lies within 15 km; only then does the "No jam in <Place> yet" line hide.
- **One static map:** the jam page's venue map became `features/map/StaticMap.tsx`, which also draws the place's violet ring.
- **`/map?lat=&lng=&fit=`:** `fit` frames its box (at most zoom 10), else `lat`/`lng` centre at zoom 9; anything malformed is ignored (`askedView`).
- **Search page:** a section with nothing in it hides while another has results; with nothing anywhere, one empty state. The search pill keeps DESIGN.md §4.26's phone layout (the button under the field), where the mockup shows it inside the pill.
- **Attribution:** GeoNames' licence asks for credit; it is in `data/places/README.md` and ARCHITECTURE.md, not yet on the site.

## Built

- Backend: `domain/place.rs` (search keys, the GeoNames line), `db/places.rs` (lookup, import), `api/places.rs`, the `data places` command, `domain::fold` shared with the dataset tool. Tests: `tests/places.rs`, `tests/unit/domain/place.rs`.
- Frontend: `features/places/` (`near.ts`, `queries.ts`, `NearCard.tsx`), `StaticMap`, `askedView`, the search page. Tests: the four of the brief in `tests/routes/SearchPage.test.tsx`, plus `tests/features/places/near.test.ts` and `askedView` in `tests/features/map/jams.test.ts`.
- Docs: DESIGN.md §4.33 and §6 Search, ARCHITECTURE.md, `deploy/README.md` (step 12), `data/places/README.md`.
