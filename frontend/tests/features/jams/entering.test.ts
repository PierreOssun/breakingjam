import type { Schemas } from "../../../src/api/client";
import { entryState } from "../../../src/features/jams/entering";

const at = "2026-10-01T10:00:00Z";
const NOVA = "01920000-0000-7000-8000-0000000000d1";

const jam = (extra: object = {}) =>
  ({
    status: "published",
    phase: "upcoming",
    takes_entries: true,
    registration_url: null,
    can_edit_battles: false,
    ...extra,
  }) as Schemas["EventResponse"];

const battle = (extra: object = {}) =>
  ({
    id: "b1",
    registration: "open",
    max_entries: 2,
    entries: [],
    ...extra,
  }) as unknown as Schemas["BattleDetail"];

const entry = (dancer: string, status = "confirmed") => ({
  id: `e-${dancer}`,
  status,
  members: [{ id: dancer }],
  created_at: at,
});

const me = (dancer: { verified: boolean } | null) =>
  ({
    id: "u1",
    dancer: dancer && { id: NOVA, dancer_name: "Nova", ...dancer },
  }) as Schemas["UserResponse"];
const VERIFIED = me({ verified: true });

describe("what a battle card offers", () => {
  it.each([
    [
      "nothing once the jam is past",
      jam({ phase: "past" }),
      battle(),
      VERIFIED,
      null,
    ],
    [
      "the setting to its editors",
      jam({ can_edit_battles: true }),
      battle(),
      VERIFIED,
      "organiser",
    ],
    [
      "closed once registration closes",
      jam({ status: "registration_closed", takes_entries: false }),
      battle(),
      VERIFIED,
      "closed",
    ],
    [
      "closed once the jam is live",
      jam({ phase: "live", takes_entries: false }),
      battle(),
      VERIFIED,
      "closed",
    ],
    [
      "closed on a cancelled jam",
      jam({ status: "cancelled", takes_entries: false }),
      battle(),
      VERIFIED,
      "closed",
    ],
    [
      "the organiser's site",
      jam({ registration_url: "https://x.org" }),
      battle({ registration: "organizer" }),
      VERIFIED,
      "site",
    ],
    [
      "the organiser's contact",
      jam(),
      battle({ registration: "organizer" }),
      VERIFIED,
      "contact",
    ],
    ["you're in", jam(), battle({ entries: [entry(NOVA)] }), VERIFIED, "in"],
    [
      "full",
      jam(),
      battle({ entries: [entry("a"), entry("b")] }),
      VERIFIED,
      "full",
    ],
    [
      "a place freed by a withdrawal",
      jam(),
      battle({ entries: [entry("a"), entry("b", "withdrawn")] }),
      VERIFIED,
      "enter",
    ],
    ["log in to a visitor", jam(), battle(), null, "login"],
    [
      "verification to an unverified page",
      jam(),
      battle(),
      me({ verified: false }),
      "verify",
    ],
    [
      "verification to an account without a page",
      jam(),
      battle(),
      me(null),
      "verify",
    ],
    [
      "enter, without a maximum too",
      jam(),
      battle({ max_entries: null }),
      VERIFIED,
      "enter",
    ],
  ])("offers %s", (_what, j, b, viewer, expected) => {
    expect(entryState(j, b, viewer)).toBe(expected);
  });
});

describe("what a battle with approval offers", () => {
  const approval = (extra: object = {}) =>
    battle({ registration: "approval", ...extra });
  const request = (status: string) =>
    ({ id: "r1", battle_id: "b1", status }) as Schemas["MyRequest"];

  it.each([
    ["ask to the verified", approval(), undefined, "ask"],
    ["request sent while it waits", approval(), request("pending"), "pending"],
    ["declined once declined", approval(), request("rejected"), "declined"],
    // Accepted is an entry: the card says you're in.
    [
      "you're in once accepted",
      approval({ entries: [entry(NOVA)] }),
      request("approved"),
      "in",
    ],
    [
      "full before asking",
      approval({ entries: [entry("a"), entry("b")] }),
      undefined,
      "full",
    ],
  ])("offers %s", (_what, b, mine, expected) => {
    expect(entryState(jam(), b, VERIFIED, mine)).toBe(expected);
  });
});
