# Milestone 20 — API next to the database, loading placeholders

The author saw UAT pages fill in piece by piece: "Next up near you" took about 3 s, and data on other pages appeared only after a blank wait.

## Why it was slow (measured from Zurich on 2026-10-26)

| Request | Time |
|---|---|
| A static file (Worker only) | ~0.1 s |
| `/api/geo` (API, no database) | ~0.25 s |
| `/api/health` (one query) | ~0.75 s |
| `/api/events.geojson` (two queries in a row) | 1.4–1.9 s |

`wrangler containers instances` showed UAT's only instance in `lax07`, Los Angeles, with Neon in Frankfurt. `getRandom` names instances `instance-N` with no location, and a Durable Object stays where its first request came from: most likely the deploy's health check from a US GitHub runner.

## Decisions

- **Placement:** the Worker picks the instance itself, as `weur-N` with the location hint `weur`. New names, because the `instance-N` objects stay pinned in Los Angeles. The hint is best effort and places only the Durable Object, so `wrangler.jsonc` also limits both targets' containers to the `WEUR` region (`constraints.regions`; found by `/code-review`). To check after the deploy: `npx wrangler containers instances <id>` should list a European location.
- **Loading:** no full-page spinner (asked, and answered with this). What needs no data shows at once, and placeholders in the final shape hold the place of what loads (DESIGN.md §4.29).
- **Not done:** caching the public data (map data, stats) in the Worker. It would also hide the cold starts (the container after 30 minutes idle, Neon after a few minutes); worth it if UAT still feels slow once the placement is fixed.

## Built

- `deploy/src/index.ts`: `api()` picks `weur-N` with `{ locationHint: "weur" }`, replacing `getRandom`.
- `components/Skeleton.tsx`: `Skeleton` (a block), `Loading` (`aria-busy`, one hidden "Loading…"), `RowSkeleton` and `RowsSkeleton`. A `Skeleton` has no default radius: Tailwind's order made a default `rounded-md` win over every caller's own radius.
- The landing's sections hide only when a first load fails; a failed refetch keeps what they show. The jam page's battles and the dancer and organiser pages' jam lists show the generic error message on failure.
- Placeholders on the landing ("Next up" cards, the scene's counts), the jam page (whole page, then its battles), the dancer and organiser pages, the jam editor, `/jams`, `/search`, the map's list (desktop panel and mobile list), and every paged list (`MoreList`).
