# Welcome step (M25)

Today an account without a dancer page is a dead end: nothing tells the person what to do next. M25 adds one step after sign-up and lets a page say what its dancer does. Agreed with the author on 2026-11-03.

## Decisions

- **The account and the page stay separate.** The account is how someone logs in; the page is their identity in the scene. Forcing a page at sign-up would cut sign-ups, since many visitors only want to see jams. Social features, later, attach to the account.
- **Welcome step** (`/welcome?next=…`), right after sign-up by email or Google: "Are you on BreakingJam?"
  - **Find:** a search pre-filled with the account's name; each match leads to its page, where "This is me" verifies it.
  - **Create my page:** offered once a search has run (search before create); makes the account's own page, unverified.
  - **Skip, I'm just here for the jams:** on to `next`.
- **One page of its own per account.** It is `source = 'self'` and is made only through `POST /api/dancers/mine`, whatever the account's role. A partial unique index holds the rule. It counts a page as `own_page` does: live, not merged away, and owned by nobody else. An account whose page went to someone else (a merge, or another's claim) may make one again. A page merged into one nobody owns is still the account's through the merge, so the handler refuses a second one. `POST /api/dancers`, for pages of others, became `organizer`+, so no account can mint pages through the API.
- **`me.dancer`** is the account's own page, verified or still waiting for its claim, with a `verified` flag: the page an approved claim linked, else the account's `self` page or the page it was merged into, unless someone else owns that.
- **One page type for everyone.** Accounts get no sub-roles; `role` stays for permissions. The code keeps `dancers`; the UI says "people", "my page" and "stage name", never "dancer" for a DJ.
- **"I'm a…" titles:** Bboy, Bgirl, Breaker, DJ, MC, Judge, several at once, none by default.
  - **Breaker** is the neutral word, so nobody has to pick a side.
  - Only the page's verified owner and `seed_admin`+ set them, so BreakingJam never guesses anyone's gender or role.
  - The default avatar suggested by a bgirl battle stays: a look, not a label.
- **Not in M25:** the Find someone filters (by title and by country), which become useful once people have titles; self-created pages stay in search, because hiding them would also hide them from the organisers' pickers and bring back duplicates.

## Steps

1. Migration `20261103000001_own_page_and_titles`: the one-own-page index, after turning every older `self` page into `organizer` (before M25, `self` meant a page a plain account made through the API, not its own; changed after the second review), the `dancer_title` enum and `dancers.titles`.
2. API: `POST /api/dancers/mine`, `POST /api/dancers` organiser-only, titles on create and update with `can_set_titles`, `me.dancer` as the own page, Google's new accounts sent to the welcome step; a merge gives a survivor with no titles and no owner the loser's.
3. Frontend: the welcome page, the sign-up redirect, the account menu ("Not verified yet · Verify it", "Find my page" to the welcome step), the titles on the dancer page and as chips in the edit sheet.
