# Entering battles and "I'm going" (M32)

Until M32, only a jam's organiser (and `seed_admin`+) adds entries; dancers get in through an outside link or the organiser card's **Contact**. M32 lets the organiser choose, per battle, how dancers enter, and gives every jam an **I'm going** button with a public count. It reverses M24's "battle registration stays an outside link".

Nothing is built yet: this is the brief. It has three parts: the author's decisions, the UI brief from Design, and the schema and API sketch.

## Decisions (with the author, 2026-11-15)

- **Verified dancers only**, in both self-service modes. Verification is a manual admin review, so a dancer who signs up today can't enter today; accepted.
- **Open is for solo battles only** (1v1, 7 to Smoke). A team battle is With approval or By the organiser: the organiser's check is what stops a fake team naming a real dancer.
- **Teams:** the captain, a verified dancer, names the team and adds the teammates through a search-then-create picker, as the organiser does in the entry sheet.
  - Teammates may be verified, unverified or not yet on BreakingJam (their page is made when the request is sent).
  - A declined request can leave such pages without a jam; accepted, since only verified dancers can make them and admins can merge or delete.
  - **Only full teams** can be sent. A battle without a fixed entry size (a showcase without a size, an imported crew battle of unknown size) therefore stays By the organiser until it has one. *(This consequence was proposed by Claude and is not yet confirmed.)*
- **Requests are their own table**, never `entries` rows: a `pending` entry is public and means "team not complete", and eleven queries read entries that way.
- **The organiser sees the Instagram handle on a request even when the dancer hides it publicly.** The sheet says so before the dancer confirms.
- **No eligibility checks.** The site stores no gender or age, so a Bgirl or Kids battle stays the organiser's call.
- **Who is going:** the count is clickable and opens the list of the **verified** dancers who are going, each linking to their page, then "and N others". An unverified page proves nothing, so a page named after a known dancer could otherwise appear in it.
- **Going is per account**, not per dancer page: spectators and organisers come too.
- **Emails:**
  - To the organiser: one per dancer who enters or asks, at the account's login email (confirmed since M27). No daily digest.
  - To the dancer: "request sent", "accepted" and "declined".
  - Accounts get a `language` column, set at sign-up and when the language is switched: today the mail's language comes from the browser that triggers it, which here is the other person's.
  - Sent in the background, as the codes are, so a slow mail service never fails a request.

## Where the decisions and the UI brief differ

The UI brief below was written from the first research note, before the author's answers. Where they differ, **the author's decisions above are taken to win; to confirm with the author before the step is built.**

| Topic | UI brief | Author's decision | What changes in the brief |
|---|---|---|---|
| Who is going (step 1) | The count only: no names, no avatars. The sheet says "Only the number of people going is public, not who." | The count opens the list of verified dancers going, then "and N others". | The count line becomes a control that opens the list. The sheet's privacy line must be rewritten, and the list needs a design. |
| Emails to the organiser (step 4) | At most one email per jam per day while requests wait. | One email per dancer, no daily digest. | One subject per dancer instead of "3 dancers asked to enter…". |
| Emails to the dancer (step 4) | Accepted and declined. | Also "request sent". | One more email. |
| Team requests (step 3) | Not drawn: the brief covers solo requests only. | The captain sends a full team, with a teammate picker. | The Ask sheet for a team (team name, teammates) and the team's card in the Requests sheet need a design. |

The brief also settles two points the research left open:

- **Wording:** "enter" and "entries" for battles, never "register"; French "Participer".
- **Past jams:** neither the button nor the count shows.

## UI brief from Design (2026-11-15)

This is the design for the two features in your research note ("Both features fit the current model…"). The data model, endpoints and build order in that note stand; this brief adds the screens, the states and the exact copy.

Reference images, in `milestones/32-battle-registration-and-going/`:

- `1-dancer-flow.png`: jam page, the "I'm going" sheet, the two confirm sheets
- `2-all-states.png`: every state of the battle card and of the jam page actions
- `3-organiser.png`: the "Who can enter" setting (solo and team) and the requests sheet

Use the existing components and tokens (buttons, sheets, tags, dancer chips, notes). Do not add new colours or radii. Where an image and this text disagree, the text wins.

### Decisions this design assumes

Each one is Iki's to change. Keep each behind one condition so it can be flipped without touching the screens.

1. **Verified only.** Both "Enter battle" and "Ask to enter" need a verified dancer page.
2. **Team battles have no Open mode.** Open is for solo battles (1v1, 7 to Smoke).
3. **Who is going:** the count only. No names, no avatars.
4. **Organiser notice:** a count on the battle card and in the account menu from step 3; emails come in step 4.
5. **No eligibility check** (gender, age). That stays with the organiser.

### Build order

Same as the note. Each step ships on its own.

1. "I'm going"
2. The battle setting, and Open mode for solo battles
3. With approval: requests, accept and decline
4. Emails

---

### Step 1: "I'm going"

#### Where

On the jam page, directly under the title, date and place, above the first section. Shown on published or registration-closed jams that are upcoming or live. On past, cancelled and draft jams show neither the button nor the count.

#### Layout

| Situation | Buttons |
|---|---|
| At least one battle can be entered on the site (Open or With approval, registration open) | Two equal buttons in a row: primary **Enter a battle ↓** (scrolls to the Battles section), secondary **I'm going** |
| The jam shows today's outside "Register to battle" link | Keep that button as primary, **I'm going** secondary beside it |
| Neither | One full-width primary **I'm going** |

Under the buttons, one muted line with the people icon: **"42 going"**. Singular is "1 going". Hide the line at 0.

Until step 2 ships, only the second and third rows apply.

#### States of the button

- **Not going:** "I'm going".
- **Going:** "✓ You're going", outlined in the primary colour with a light primary tint. When it is the only button, put a secondary **Add to calendar** button beside it.
- **Logged out:** same button. The tap starts login, and after login the action is applied and the user lands back on the jam page.

Update the button and the count at once and roll back with an error toast if the call fails.

#### Sheet after the first tap

Bottom sheet on mobile, dialog (max 480px) on desktop.

- Green pill: "✓ You're going"
- Title: "See you on Sat 12 Dec" (the jam's first day)
- One muted line: jam name · city · times
- Primary button: **Add to calendar**. Reuse the calendar export if one exists; otherwise offer an .ics download and a Google Calendar link.
- Secondary button: **Share with your crew** (the existing share)
- Small centred line: "Only the number of people going is public, not who."

Tapping "You're going" later reopens this sheet with one more text link at the bottom: **I'm not going any more** (not in the image). It removes the row, closes the sheet and lowers the count.

#### Link with battles

Entering a battle marks the account as going (server side). The page then shows "You're going" and the higher count without a reload. Withdrawing from a battle does not remove "going".

---

### Step 2: the battle setting and Open mode

#### Organiser: "Who can enter"

In the battle sheet's Details step, after the existing fields, a radio group labelled **Who can enter**. Three radio cards, each with a title and one line:

| Option | Line |
|---|---|
| **By the organiser** (tag "Default") | "You add the dancers yourself. Dancers reach you through Contact." |
| **With approval** | "Verified dancers ask to enter. You see their Instagram, then accept or decline." |
| **Open** | "Verified dancers enter directly, until the battle is full." |

- Selected card: primary border and a soft primary ring. The whole card is the click target.
- New and existing battles start on "By the organiser".
- **Team battles:** say "teams" instead of "dancers" in the first line. "Open" is disabled, with the tag "Solo only" and the line "For solo battles only. A team needs your approval."
- If the organiser changes a solo battle with Open to a team category, move the setting to "With approval" and say so in a toast.
- Ship "With approval" disabled with the tag "Soon" until step 3, or leave it out until then.

#### Dancer: the battle card

Add an action area at the bottom of each battle card, separated by a hairline. It holds one control and one small muted line. Pick the state in this order; the first that matches wins.

| # | When | Control | Line under it |
|---|---|---|---|
| 1 | The viewer is the jam's organiser or an admin | See "What the organiser sees" | |
| 2 | Registration is closed, or the jam is live, past or cancelled | Grey pill with a lock: "Registration closed" | none |
| 3 | Mode is By the organiser, the jam has a registration link | Secondary button: "Register on the organiser's site ↗" | "Opens the organiser's own registration page." |
| 4 | Mode is By the organiser, no link | Secondary button: "Contact the organiser" | "The organiser adds the dancers." (or "teams") |
| 5 | The viewer has an entry in this battle | Green pill "✓ You're in", and a text link "Withdraw" on the right | "You can withdraw until registration closes." |
| 6 | Open, the battle is full | Grey pill: "Battle is full" | "32 of 32 places taken. Contact the organiser" (link) |
| 7 | Logged out | Primary button: "Log in to enter" | "You need a verified dancer page to enter." |
| 8 | Logged in, no verified page | Secondary button with the verified tick: "Get verified to enter" (goes to the claim or verify flow) | "Only verified dancers can enter. Verification is a manual check and can take a day." |
| 9 | Open | Primary button: **Enter battle** | "You enter directly. 20 places left." Drop the second sentence when the battle has no maximum. |

Row 5 also covers a dancer the organiser added by hand.

#### Enter sheet (Open)

- Title: "Enter 1v1 Bboy"
- A card "ENTERING AS" with the viewer's avatar, stage name, verified tick and country
- Three lines with icons: date and jam name; "1v1 Bboy starts 14:00"; "12 of 32 places taken"
- Note: "Your name appears on the jam page straight away. You can withdraw until registration closes."
- Primary button: **Enter battle**

On success, close the sheet. The card switches to row 5, the viewer's chip appears first in the entrants list as "Nova · you" with a primary outline, the count goes up, and the jam shows "You're going".

If the server answers "full", keep the sheet open, show "This battle just filled up." above the button, disable the button, and switch the card behind to row 6.

#### Withdraw

"Withdraw" opens a small confirm: "Withdraw from 1v1 Bboy?" with **Withdraw** and **Keep my place**. After it, the card returns to row 9.

---

### Step 3: With approval

#### Dancer

Insert these rows into the table above, after row 5:

| When | Control | Line under it |
|---|---|---|
| The viewer has a pending request | Purple pill with a clock: "Request sent", and a text link "Cancel request" on the right | "You get an email when the organiser answers." |
| The viewer's last request was declined | Grey pill with a cross: "Request declined" | "The organiser declined your request. Contact the organiser" (link) |
| With approval, the viewer can ask | Primary button: **Ask to enter** | "The organiser accepts or declines your request." |

- A pending request is never shown publicly: not in the entrants list, not in the count.
- An accepted request becomes a normal entry, so the card shows row 5 ("You're in").
- "Cancel request" acts at once and returns the card to "Ask to enter".
- Until step 4 ships, the pending line reads "Check back here for the answer."

#### Ask sheet

- Title: "Ask to enter 1v1 Bgirl"
- Sub-line: "The organiser looks at your request and accepts or declines it."
- The "ASKING AS" card and the three lines, as in the Enter sheet
- A tinted note with the Instagram icon. Pick one:
  - Instagram hidden on the page: "The organiser will see your Instagram **@handle**, even though it is hidden on your page."
  - Instagram public: "The organiser will see your Instagram **@handle**."
  - No Instagram: "You have no Instagram on your page. The organiser will only see your name." with a link "Add Instagram" to Edit profile.
- Primary button: **Send request**
- Small centred line: "You get an email with the answer. You can cancel the request any time." (Until step 4: "You can cancel the request any time.")

#### What the organiser sees

On their own jam page, the battle card's action area shows the setting instead of the dancer button:

| Mode | Left | Right |
|---|---|---|
| With approval, requests waiting | Purple pill with a bell: "3 requests waiting" | Text link "Review ›" (opens the requests sheet) |
| With approval, none waiting | Muted text: "With approval · no requests waiting" | Text link "Change" (opens the battle sheet) |
| Open | Muted text: "Open · dancers enter directly" | "Change" |
| By the organiser | Muted text: "By the organiser · you add the dancers" | "Change" |

In the account menu, organisers with waiting requests get an item **Requests** with the total count. With one jam it goes to that jam's page at the Battles section; with several it lists the jams.

#### Requests sheet

Bottom sheet on mobile, dialog (max 520px) on desktop.

- Title: "Requests"
- Sub-line: "1v1 Bgirl · 2 of 16 entered · **3 waiting**" (the waiting part in the accent colour)
- One card per request, oldest first:
  - Avatar (48px), stage name, verified tick, country chip; on the right, when it was sent ("2 h ago", "Yesterday")
  - The Instagram handle as a link that opens Instagram in a new tab. If the dancer hides it publicly, add a small lock and "hidden on their page".
  - The name and avatar link to the dancer page.
  - Two equal buttons: primary **✓ Accept**, secondary **Decline**
- Footer line: "Accepted dancers appear on the jam page. Each dancer gets an email with your answer." (Until step 4, only the first sentence.)
- Accept and Decline act at once. The card leaves the list and the counts in the sub-line and on the battle card update.
- When the battle is full, Accept is disabled on every card and the sub-line ends with "· full".
- Empty state: "No requests waiting."

---

### Step 4: emails

- **To the organiser:** at most one email per jam per day while requests wait. Subject: "3 dancers asked to enter Winter Cypher Jam". Body: the battles with their counts and one button, "Review requests".
- **To the dancer, accepted:** subject "You're in: 1v1 Bgirl at Winter Cypher Jam". Body: date, start time, venue, a button to the jam page, and how to withdraw.
- **To the dancer, declined:** subject "Your request for 1v1 Bgirl at Winter Cypher Jam". Body: "The organiser declined your request." and a link to contact the organiser.

When this ships, restore the two lines that mention email in step 3.

---

### Rules for every step

- **Copy:** use "enter" and "entries", never "register", for battles. French for "Enter battle" is "Participer". Add every string to every locale file.
- **Touch targets:** every button, pill link and radio card is at least 44px high.
- **Accessibility:** the setting is a real radio group with arrow-key support. State changes on the card are announced (aria-live polite). Sheets trap focus and return it to the control that opened them.
- **Mobile first:** build at 375px, then check desktop. On desktop the sheets become centred dialogs.
- **Dark theme:** check every new state in both themes.
- **Docs:** update the privacy page, ARCHITECTURE.md and DESIGN.md with each step, as the note says.

### Tests

- "I'm going": toggle on and off, the count, the logged-out path through login, hidden on past and cancelled jams.
- Entering a battle marks going; withdrawing does not unmark it.
- Each row of the battle card table renders for the right viewer and jam status.
- Open: enter, appear in the list, withdraw; the "full" answer from the server.
- A team battle cannot be saved with Open.
- With approval: a request is not public; accept creates an entry; decline does not; cancel returns to "Ask to enter".
- A non-organiser cannot open the requests sheet or call its endpoints.
- The organiser sees a hidden Instagram handle on a request; the public page still hides it.

## Schema (a sketch; each migration is shown as SQL again before it is applied)

```sql
-- step 1
create table event_attendees (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- step 2
create type battle_registration as enum ('organizer', 'approval', 'open');
alter table battles add column registration battle_registration not null default 'organizer';

-- step 3
create table battle_requests (
  id uuid primary key,
  battle_id uuid not null references battles(id) on delete cascade,
  dancer_id uuid not null references dancers(id),          -- the dancer asking, or the captain
  user_id uuid not null references app_users(id) on delete cascade,
  team_name text,
  status claim_status not null default 'pending',          -- pending, approved, rejected; a cancelled request is deleted
  decided_by uuid references app_users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index on battle_requests (battle_id, dancer_id) where status = 'pending';
create table battle_request_members (                       -- the teammates of a team request
  request_id uuid not null references battle_requests(id) on delete cascade,
  dancer_id uuid not null references dancers(id),
  primary key (request_id, dancer_id)
);

-- step 4
alter table app_users add column language text;             -- en, fr, de; null = not known yet
```

## API (a sketch)

- `PUT` and `DELETE /api/events/{id}/going`; `GET /api/events/{id}` gains `going_count` and `going`; `GET /api/events/{id}/going` lists the verified dancers.
- `registration` on the battle's fields and responses; a team battle saved with `open` is 422.
- `POST /api/battles/{id}/enter` (Open), `POST /api/battles/{id}/requests` (With approval), `GET /api/battles/{id}/requests` for the jam's writers, `POST /api/requests/{id}/accept | decline`, `DELETE /api/requests/{id}` for the dancer.

## Steps

1. "I'm going": the table, the routes, the buttons, the count and the list.
2. The battle setting, and Open for solo battles.
3. With approval: solo requests with accept and decline, then team requests with the teammate picker.
4. Emails, with the account language.

Each step updates ARCHITECTURE.md, DESIGN.md and the privacy page for what it adds.

## Still open

- The four differences in the table above, to confirm.
- **The action bar and action card** (DESIGN.md §4.32): the UI brief puts the buttons under the title, date and place. It doesn't say whether the bar along the bottom on phones and the card under the flyer on desktop stay, move or go.
- **A declined dancer** has no button to ask again in the brief; kept that way unless the author says otherwise.
- **An accepted team:** whether the captain can change it, or only withdraw it and ask again (the first version: withdraw only).
