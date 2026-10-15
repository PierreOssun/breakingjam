# Milestone 15 — Jam contact, featured jams, site counts

The author's request (in French): an organiser contact email and a website on the jam page; "Featured near you" first on the home page, chosen by the visitor's location; and counts on the home page (countries covered, battles per country, total battles, total dancers).

## Decisions (asked at the start)

- **Contact email:** public, as a plain `mailto:` link. The field is optional, so publishing it is the organiser's choice.
- **Featured near you:** the visitor's country's jams come first. When there are fewer than 6, the nearest jams abroad fill the section, so it never looks empty.
- **"Nearest"** is measured from the centre of the visitor's country box (the map's Natural Earth boxes). No new location data; it is coarse for big countries.
- **Battles by country:** the 10 busiest countries, then "+ N more countries".
- **Doc changes:**
  - ARCHITECTURE §1 and §6 said the landing page fetches no data (M10). This request reverses that, and both sections now say so.
  - DESIGN.md's "Next up" row became "Featured near you", now at the top and with row cards.

## Jam contact

- **Migration** `20261017000000_event_contact.sql`: `events.contact_email` and `events.website_url`, both optional.
- **API validation:** the website has to be an `http(s)://` link (the same rule as the other links). The email goes through `email_or_blank`. Blanks are stored as null, and both are trimmed.
- **Jam form:** "Website" and "Contact email" fields, the latter with a hint that it is public. Zod mirrors the server rules.
- **Jam page facts:** dates, venue, **Website** (its host as the label, e.g. "pariscypher.com", opening in a new tab), **Email** (`mailto:`), then Instagram.

## Featured near you

- **Selection:** `featuredJams` in `features/map/jams.ts` (pure, tested) takes upcoming jams only. The visitor's country's jams come first, by date; then the others by distance from that country's centre, or by date when the country is unknown. At most 6.
- **Data:** the section reads `GET /api/events.geojson` and `GET /api/geo`. It shares the map's cache, so opening the map afterwards is instant. It shows nothing until both have answered, and nothing when no jam is upcoming.
- **Display:** a line under the title says where the jams are: "Upcoming jams in Switzerland", "… and nearby", "The closest upcoming jams", or "The next jams on the map". Then the map's row cards and **See the map →**.

## Site counts

- **API:** `GET /api/stats` (public) counts public jams only (published, registration closed or completed; drafts, jams in review and cancelled ones don't count):
  - countries with at least one public jam
  - their battles, in total and per country, busiest first
  - dancer pages (merged and deleted ones left out)
- **Display:** "BreakingJam in numbers", between the hero and the organisers' steps.

## Also fixed

The landing page's "how it works" still said organisers publish their own jams. Since M14 they submit them for review, so step 1 and step 3 ("Submit it") now say so in all three languages.

## Tests

- **Backend:**
  - The website and email round-trip, trimmed, and invalid ones are named field errors.
  - `email_or_blank` has unit cases.
  - `GET /api/stats` is checked against published, draft and cancelled jams in several countries.
- **Frontend:**
  - `featuredJams`: the country first, the nearest for a country without jams, the soonest for an unknown one, past jams left out, at most 6.
  - The landing page's featured section and counts (top 10, then "+ 1 more country").
  - The jam page's website and email links, and the form body.
