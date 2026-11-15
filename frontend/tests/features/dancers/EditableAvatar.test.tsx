import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FIGHTERS } from "../../../src/features/dancers/fighters";
import {
  LIL_G,
  LOGGED_OUT,
  bodyOf,
  mockApi,
  renderApp,
} from "../../support/app";

const at = "2026-10-01T10:00:00Z";
const ID = "01920000-0000-7000-8000-0000000000d1";
const DANCER = {
  id: ID,
  dancer_name: "Ventus",
  aliases: [],
  country: "FR",
  country2: null,
  city: "Paris",
  bio: null,
  instagram_handle: "ventus_bj",
  instagram_hidden: false,
  source: "organizer",
  verified_at: at,
  avatar_url: null,
  avatar: null,
  merged_into_id: null,
  created_at: at,
  updated_at: at,
  crews: [],
  titles: [],
  can_edit: false,
  can_set_titles: false,
};
const MINE = { ...DANCER, can_edit: true, can_set_titles: true };
/** The account whose verified page this is, as the header shows it. */
const OWNER = {
  ...LIL_G,
  dancer: {
    id: ID,
    dancer_name: "Ventus",
    country: "FR",
    country2: null,
    instagram_handle: "ventus_bj",
    avatar_url: null,
    avatar: null,
    deleted: false,
    verified: true,
  },
};
const VOLT = FIGHTERS[1]!.avatar;
const PUT = `PUT /api/dancers/${ID}/avatar`;

type Replies = Parameters<typeof mockApi>[0];

function page(me: Replies[string], dancer: object, replies: Replies = {}) {
  const fetch = mockApi({
    "GET /api/auth/me": me,
    [`GET /api/dancers/${ID}`]: { status: 200, body: dancer },
    [`GET /api/dancers/${ID}/events`]: {
      status: 200,
      body: { live: [], upcoming: [], past: [] },
    },
    ...replies,
  });
  renderApp(`/dancers/${ID}`);
  return fetch;
}

/** The pixels an avatar draws, whatever its size. */
const pixels = (within: HTMLElement) =>
  within.querySelector('svg[role="img"] g')?.innerHTML;

describe("the dancer page's avatar", () => {
  it("opens the builder straight from the avatar, for whoever may edit the page", async () => {
    page({ status: 200, body: OWNER }, MINE);

    const button = await screen.findByRole("button", { name: "Edit avatar" });
    expect(button).toHaveAttribute("type", "button");
    // The avatar, then the overlay's pencil and the badge's: decoration, not a second button.
    expect(within(button).getByRole("img", { name: "Ventus" })).toBeVisible();
    expect(button.querySelectorAll('[aria-hidden="true"] svg')).toHaveLength(2);
    expect(within(button).queryByRole("button")).toBeNull();

    await userEvent.click(button);

    expect(
      await screen.findByRole("dialog", { name: "Your avatar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Edit profile" })).toBeNull();
    // The way through Edit profile stays.
    expect(
      screen.getByRole("button", { name: "Edit profile", hidden: true }),
    ).toBeInTheDocument();
  });

  it.each([
    ["a visitor", LOGGED_OUT, DANCER],
    ["someone else's account", { status: 200, body: LIL_G }, DANCER],
    // As "Edit profile": no session, no button, whatever the page was last told.
    ["a session that has ended", LOGGED_OUT, MINE],
  ])("is only a picture for %s", async (_who, me, dancer) => {
    page(me, dancer);

    const avatar = await screen.findByRole("img", { name: "Ventus" });
    expect(screen.queryByRole("button", { name: "Edit avatar" })).toBeNull();
    expect(screen.queryByText("Edit avatar")).toBeNull();
    // No badge beside it, and nothing to focus or click around it.
    expect(avatar.parentElement?.children).toHaveLength(1);
    expect(avatar.closest("button, a")).toBeNull();
    expect(avatar.parentElement).not.toHaveAttribute("tabindex");
  });

  it("shows the saved avatar on the page and in the header, without a reload", async () => {
    const fetch = page(
      // The session is read again after the save: the header's avatar comes from it.
      (n) => ({
        status: 200,
        body:
          n === 0
            ? OWNER
            : { ...OWNER, dancer: { ...OWNER.dancer, avatar: VOLT } },
      }),
      MINE,
      { [PUT]: { status: 200, body: { ...MINE, avatar: VOLT } } },
    );
    const button = await screen.findByRole("button", { name: "Edit avatar" });
    const account = await screen.findByRole("button", {
      name: "Account menu, Ventus",
    });
    const before = pixels(button);
    expect(before).toBeTruthy();
    expect(pixels(account)).toBe(before);

    await userEvent.click(button);
    const builder = within(
      await screen.findByRole("dialog", { name: "Your avatar" }),
    );
    await userEvent.click(builder.getByRole("radio", { name: "Volt" }));
    await userEvent.click(builder.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Avatar saved.")).toBeInTheDocument();
    expect(await bodyOf(fetch, PUT)).toEqual({ avatar: VOLT });
    expect(screen.queryByRole("dialog", { name: "Your avatar" })).toBeNull();
    const after = pixels(screen.getByRole("button", { name: "Edit avatar" }));
    expect(after).not.toBe(before);
    await waitFor(() => expect(pixels(account)).toBe(after));
  });
});
