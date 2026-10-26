# Account menu: requirements for Claude Code

When a user is logged in, the header gets an **account menu**. Its first item is the user's own dancer page. References:

- `account-menu-desktop.png`
- `account-menu-mobile.png`
- `account-menu-mobile-no-dancer-page.png`

## 1. Trigger (desktop ≥ 1024)

- Logged out: keep **Log in** as it is.
- Logged in: replace "Log in" and the "Admin ▾" dropdown with one **avatar pill**:
  - the user's dancer avatar (36px rounded square, `rounded-[11px]`) + display name (`font-extrabold`, truncated at 14ch) + a caret
  - style: `h-11 pl-1 pr-3 gap-2 rounded-full border border-border bg-surface`, hover `bg-surface-raised`
- Header order on the right: **EN · avatar pill · Register a jam** (primary).
- If no dancer page is linked, show a generic user icon in a `bg-surface-raised` square instead of the avatar, and the account name or email local part.

## 2. Dropdown (desktop)

- Anchored to the right edge of the pill, 8px below it.
- `w-80 p-2 rounded-[20px] bg-surface-raised border border-border-strong shadow-lg`.
- Items, in order:
  1. **Profile block** → `/d/<slug>`
     - 52px avatar, name + verified tick, "View my dancer page" in `primary-text` + chevron
     - `p-3 rounded-[14px]`, hover `bg-surface`
  2. **My jams** → organiser list. Badge "N drafts" (muted) when there are drafts.
  3. **Admin** → admin queue. **Admins only.** Badge "N to review" (primary), hidden at 0.
  4. Separator
  5. **Theme**
     - a `lbl` "Theme"
     - a 3-option segmented control: **Light / Dark / Auto**
     - Use the existing theme logic and storage. Auto means `prefers-color-scheme`.
     - If a theme toggle exists elsewhere in the header, remove it. This becomes the only one.
  6. **Account settings**
  7. Separator
  8. **Log out**: muted text, no confirm.
- Each menu item is `h-11 px-3 rounded-xl gap-3` with a 20px icon and `font-bold`. Hover and focus use `bg-surface`.

## 3. Mobile (< 1024)

- Logged in: the hamburger becomes the **avatar button** (40px rounded square). Logged out: keep the hamburger.
- Tapping it opens a **top sheet** under the header, `rounded-b-[28px] bg-surface-raised shadow-lg p-4`, with a scrim on the page below.
- The sheet contains:
  1. the profile block (as in §2)
  2. the nav: **Jam map · Find a jam · Find someone**
  3. separator
  4. My jams (badge) · Admin (admins only, badge)
  5. the theme segmented control (full width)
  6. Account settings · Log out
  7. a full-width primary **Register a jam** at the bottom
- Close the sheet by tapping the scrim, pressing Esc, navigating, or tapping the avatar button again.
- Lock body scroll while it's open.

## 4. No dancer page linked

- In place of the profile block, show a dashed card: `border-2 border-dashed border-border-strong rounded-[20px] p-4`.
  - Title: "Are you a dancer?"
  - Body: "Find your page and claim it."
  - A secondary sm button **Find my dancer page**. It goes to the Find someone search, prefilled with the account name, where the existing "This is me" flow takes over.
- Everything else stays the same.

## 5. Accessibility

- The trigger has `aria-haspopup="menu"`, `aria-expanded`, and `aria-label="Account menu"`.
- The menu has `role="menu"`, and its items have `role="menuitem"`.
- Up/Down move between items, Esc closes, and closing returns focus to the trigger. Clicking outside closes the menu.
- The segmented control is a `radiogroup`.
- Touch targets are at least 44px. Light and dark both meet AA.

## 6. DESIGN.md

- **§4.6 Header:** describe the logged-out and logged-in states, the avatar pill, and the mobile avatar button.
- **New §4.31 Account menu:** the item order, the badges, the admin-only rule, the theme control and the unclaimed card.

## Done when

- Logged in with a linked page: one click (desktop) or one tap (mobile) opens the menu, and the first item opens my dancer page.
- Non-admins never see Admin.
- The badges show the live counts and are hidden at 0.
- The theme choice persists across reloads, and Auto follows the OS.
- Keyboard-only use works: open, navigate, Esc, and focus returns to the trigger.
- Existing tests pass. Add tests for:
  - which items each role sees (user, user without a dancer page, admin)
  - badge visibility
  - theme persistence

## Built: decisions where the brief left a gap (Claude Code)

- **No reference images** were in the repo (`account-menu-*.png`); built from the three mockups pasted in the session.
- **Account settings is left out:** there is no settings page, and the API can't change an account's name, email or password. The author chose to add the item once a page exists.
- **Breakpoint:** the pill and dropdown show from `xl` (1280), not 1024: DESIGN.md §4.6 keeps the full bar for `xl` because French and German labels or a long name overflow it at `lg`. Below `xl`, the avatar button and sheet.
- **Dancer page link:** `/dancers/<id>`, the app's route (ARCHITECTURE.md wins over DESIGN.md's `/d/<slug>`). `GET /api/auth/me` (and register, login, role change) now returns the linked page as `dancer`; only an approved claim sets it, so the tick always shows.
- **Name in the pill:** the dancer name when a page is linked, else the account's name, else the email's local part. Its accessible name is "<name>, account menu", so voice control can use what it shows (WCAG 2.5.3); the avatar button, which shows no text, is "Account menu".
- **Counts:** "N drafts" counts `GET /api/events?mine=true&status=draft` (up to 200, the API's largest page); "N to review" adds jams in review and pending dancer and organiser claims from `GET /api/admin/stats`, the admin tabs' figures. Both are fetched each time the menu opens.
- **Theme:** there was no theme switch or storage yet (only the CSS for `[data-theme]`). `src/lib/theme.ts` keeps the choice in `localStorage` (`bj.theme`), sets `data-theme` before the app renders, and the maps follow it. A visitor whose choice differs from the OS may see the other background for an instant on load: the CSP forbids the inline script that would set it before the first paint.
- **Accessibility:** a `radiogroup` isn't allowed inside `role="menu"`, so the theme options are `menuitemradio`s in a `group` named "Theme": the arrows reach them like the other items. The avatar in the profile block is hidden from screen readers, as the name follows it.
- **The sheet** hangs from the header (not `fixed` to the viewport), so it stays under the header with UAT's test-site notice above it.
- **My jams only for organisers** (asked after the first build): a plain `user` has never registered a jam (the first one promotes the account to `organizer`, and the jam form refreshes the session), so the role decides, with no extra request and nothing appearing late. The team and admins keep it.
