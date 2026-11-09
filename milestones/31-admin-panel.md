# Admin panel for production (M31)

Until M31 the admin area had an overview, the jam review queue and the Instagram claims. Anyone with `admin` could give any role to anyone through `PUT /admin/users/{id}/role`, which no screen used; the first admin was set with SQL. Nothing recorded who approved or rejected a jam, and nothing recorded logins. M31 adds a super admin who manages the team, one Accounts tab, and a history under the jam and claim queues. Agreed with the author on 2026-11-09.

## Decisions

- **Roles:** `user < organizer < seed_admin < admin < super_admin`. A check for a role still passes for every higher one, so `super_admin` can do everything an admin can.
  - **One super admin**, enforced by a unique index. It is set with SQL in Neon, as the first admin was; no screen creates, changes or removes it.
  - **The super admin** can make any account `seed_admin` or `admin`, change one into the other, or take it off the team.
  - **Admins** can make an account `seed_admin` or take a `seed_admin` off the team. They can't grant `admin` or touch an admin's or the super admin's account.
  - Nobody changes their own role (as today).
  - **Taking someone off the team** sets `organizer` when the account owns a jam, else `user`, the same rule as a first draft (M26). Their sessions stay: the role is read on every request, so the change takes effect at once.
  - **Adding someone** means finding an existing account by its email. The person signs up and confirms their email first; there is no invite email.
- **Team jams stay team jams.** Until M31 a jam counted as the team's when its owner's role was `seed_admin`+, so taking an admin off the team would have shown their name on every jam they entered. `events.entered_by_team` is set when a `seed_admin`+ creates the jam (backfilled from the owners' roles); the organiser card, "You’re the organiser? Contact us" (M30) and the organiser page read it. Taking someone off the team hands the team jams they entered to whoever removed them, so they can't keep editing them as their "organiser".
- **One Accounts tab** (`/admin/accounts`), for admins and the super admin, in place of separate tabs. One table, searchable by email, with five views:
  - **Last seen**: accounts by `last_seen_at`, newest first;
  - **New**: accounts by `email_verified_at`, newest first;
  - **Unconfirmed**: accounts that never confirmed their email, by `created_at`, newest first;
  - **Organisers**: accounts with at least one jam (not deleted), with counts of public jams and drafts. The team's jams are left out;
  - **Team**: `seed_admin`, `admin` and `super_admin` accounts, where the role controls are.
  - Columns: email, display name, role, created, confirmed, last seen; the Organisers view adds the jam counts.
  - Team members appear as their email in the admin area. Outside it, nothing names them: their jams stay the BreakingJam team's.
- **`last_seen_at`** on `app_users`: set when a session starts (password, Google, a confirmed code, a reset) and when `GET /auth/me` slides the session, which happens once per visit. No privacy notice changes, as the site has no privacy policy yet.
- **History under the queues.**
  - Jams tab: the jams waiting for review on top (as today), then every past approval and rejection, newest first: date, jam (linked), organiser email, approved or rejected, the rejection note, the admin's email.
  - Claims tab: the pending claims on top (as today), then every past decision on dancer and organiser claims, newest first: date, dancer or organiser (linked), the claimant's email, the handle, approved or rejected, the admin's email.
  - Both lists are paged with the existing cursor pagination (`api/page.rs`).
- **One `admin_actions` log** holds what no other table records: jam approvals and rejections (with the note), merges and role changes. Each row is written in the same transaction as the action itself.
  - Merges and role changes are logged but not shown yet; the role log matters once several people hold admin rights.
  - Jam history starts with M31: earlier approvals were never recorded.
  - The claims history reads the claims themselves (`reviewed_by`, `reviewed_at`), so it goes back to the start without a copy. A claim the site withdrew (the handle changed during review) has no admin.

## Not in M31

- A note on claim rejections: the team contacts people by email or Instagram if it has questions.
- Deleting unconfirmed accounts: the view lists them; any clean-up comes later.
- Extra protection for admin sessions (shorter sessions, asking for the password again, Google-only admins): not decided.
- A privacy notice for `last_seen_at`: there is no privacy policy yet.

## Steps

1. Schema and API — done 2026-11-09:
   - migrations `20261109000001_super_admin` (the enum value alone, since Postgres can't use a new one in the transaction that adds it) and `20261109000002_admin_panel` (the one-super-admin index, `last_seen_at`, `events.entered_by_team`, `admin_actions`);
   - `Role::SuperAdmin`; the role rules above in `PUT /admin/users/{id}/role`, which hands the team jams of anyone taken off the team to whoever removed them;
   - `GET /admin/accounts?view=&q=&cursor=`;
   - `GET /admin/events/history` and `GET /admin/claims/history`;
   - the log writes in the jam review, claim review, merge and role handlers;
   - `last_seen_at` in session creation and `/auth/me`;
   - the organiser cards keyed by jam and read from the flag, not from the owner's role;
   - a `super@breakingjam.local` seed account, created by a fresh seed only (an existing database, UAT's included, gets its super admin with SQL);
   - `openapi.json`, `tests/admin.rs` and the history tests, the deploy README "Super admin" section.
2. Frontend — done 2026-11-09:
   - the Accounts tab with its five views (`?view=`), the email search (`?q=`, which no longer drops the other parameters) and a Team role dialog;
   - the API says on each account which team roles the viewer may give (`team_roles`, from `Role::may_set`), so the frontend keeps no copy of the rules;
   - the history lists under the Jams and Claims queues;
   - `atLeast(role, min)`: the admin area, the Admin menu item and the merge tool let the super admin in too;
   - the router, i18n in en/fr/de, DESIGN.md §4.39, the regenerated `schema.d.ts`, and tests.

Docs: ARCHITECTURE.md (roles and permissions §5, the `/admin` routes, the admin area in §1, `app_users` and `admin_actions` in §4), DESIGN.md (the admin tabs).
