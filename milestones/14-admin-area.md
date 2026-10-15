# Milestone 14 — Admin area

The author's request: an admin page where BreakingJam admins approve new jams before they go public, review Instagram claims, and see counts (jams, dancers, % verified…), built to grow.

## Decisions (asked at the start)

- **Review:** every organiser's jam waits for an admin. The BreakingJam team (`seed_admin`) and admins publish their own directly. Jams published before M14 stay public.
- **Layout:** `/admin` is an overview with a tab per tool: Overview, Jams, Claims. Each tab shows the size of its queue, and a new tool is one more tab.

## Jam review

- **Migration** `20261016000000_event_review.sql`: a new `in_review` status between `draft` and `published`, and `events.review_note`.
- **Status machine** (`EventStatus`, still one enum):
  - An organiser's **Submit** moves draft → in_review.
  - **Publish** (draft → published) now requires `seed_admin`+, through `Transition::required_role`.
  - An admin's `Review` is a separate small enum, so approve and reject can't go through the organiser's transition route: **Approve** moves in_review → published, **Reject(note)** moves in_review → draft.
  - Every other status change clears the note.
- **Privacy:** a jam in review is private like a draft. It stays off its page for visitors, the map, the public list (even with `?status=in_review`), dancer pages and organiser pages. Its organiser can keep editing it.
- **API** (admin only):
  - `GET /api/admin/events`: jams in review, soonest first, since those are the most urgent, each with its organiser.
  - `POST /api/admin/events/{id}/approve`.
  - `POST /api/admin/events/{id}/reject {note}`: the note is required, at most 1000 characters.
  - Approving or rejecting a jam that is not in review is a 409.
- **Organiser side:** the editor's status card offers **Submit for review** instead of **Publish** and explains the wait. A jam sent back shows "Sent back by BreakingJam: …". The status badge has an **In review** state (DESIGN.md §4.5: primary-text with `HourglassMedium`).

## Overview counts

- `GET /api/admin/stats`, one query:
  - jams upcoming, past, in review, drafts and cancelled
  - dancers, verified and with Instagram
  - organisers and verified ones
  - accounts and new ones in the last 30 days
  - pending dancer and organiser claims
- The response is flat: a new count is one column and one field.
- The page shows four cards (upcoming jams, dancers, organisers, accounts), with percentages computed in the browser, and a "To review" list linking to each queue.

## Frontend

- `/admin` (overview), `/admin/jams` (review queue) and `/admin/claims` (the existing claim queues) share `features/admin/AdminLayout.tsx`: the title, then the tabs, styled as filter chips with a count.
- The header's admin link is now **Admin** → `/admin` (it was **Claims**).
- **Send back** opens a dialog whose confirm button stays disabled until a note is written.

## Seed

A third account, `organizer@breakingjam.local` ("Cypher Collective"), with two jams waiting for review (Geneva, Milan), so the queue isn't empty locally.

## Tests

- **Backend:**
  - Unit tests: the new transitions, `review`, `required_role` and `is_public`.
  - `tests/reviews.rs`: submit then approve, with the jam hidden everywhere meanwhile. Reject needs a note, the organiser sees it, and resubmitting clears it. The team publishes directly; an organiser can't publish and the team can't review.
  - `tests/stats.rs`: every count against a known set of jams, dancers and accounts.
  - Existing tests publish through a shared `publish` helper: the owner submits, then the test approves in SQL.
  - The access sweeps picked up the new routes from `openapi.json`: 6 paged lists now, plus a valid reject body in the 404 sweep.
- **Frontend:**
  - Overview counts and tab counts, and a missing page for non-admins.
  - Approving and sending back (the note is required).
  - Submitting for review, the note on a jam sent back, and the team's direct publish.
