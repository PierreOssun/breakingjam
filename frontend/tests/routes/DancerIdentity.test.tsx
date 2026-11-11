import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LIL_G,
  LOGGED_OUT,
  bodyOf,
  calls,
  mockApi,
  renderApp,
} from "../support/app";

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
  instagram_handle: null,
  source: "organizer",
  verified_at: null,
  avatar_url: null,
  avatar: null,
  merged_into_id: null,
  created_at: at,
  updated_at: at,
  crews: [],
  titles: [],
  can_edit: false,
  can_set_titles: false,
  instagram_hidden: false,
};
const NO_EVENTS = {
  status: 200,
  body: { live: [], upcoming: [], past: [] },
};
// No claim yet: the API answers 404.
const NO_CLAIM = {
  status: 404,
  body: { error: { code: "not_found", message: "no claim" } },
};
const CLAIM = {
  id: "01920000-0000-7000-8000-0000000c1a01",
  dancer_id: ID,
  user_id: LIL_G.id,
  code: "BJ-7K2M",
  status: "pending",
  created_at: at,
  others_pending: false,
};

type Replies = Parameters<typeof mockApi>[0];

function page(me: Replies[string], dancer: object = {}, replies: Replies = {}) {
  return mockApi({
    "GET /api/auth/me": me,
    [`GET /api/dancers/${ID}`]: { status: 200, body: { ...DANCER, ...dancer } },
    [`GET /api/dancers/${ID}/events`]: NO_EVENTS,
    ...replies,
  });
}

const user = { status: 200, body: LIL_G };
const admin = { status: 200, body: { ...LIL_G, role: "admin" } };

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("dancer identity", () => {
  it("draws the generated pixel avatar, named after the dancer", async () => {
    page(LOGGED_OUT);
    renderApp(`/dancers/${ID}`);

    const avatar = await screen.findByRole("img", { name: "Ventus" });
    expect(avatar.tagName.toLowerCase()).toBe("svg");
    // Visitors get no action at all.
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
  });

  it("gives the code to put on Instagram, then shows the claim as pending", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    page(
      user,
      {},
      {
        [`GET /api/dancers/${ID}/claim`]: NO_CLAIM,
        [`POST /api/dancers/${ID}/claim`]: {
          status: 200,
          body: { ...CLAIM, others_pending: true },
        },
      },
    );
    renderApp(`/dancers/${ID}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "This is me" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Verify it’s you" });
    expect(within(dialog).getByText("BJ-7K2M")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Someone else has already asked/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/send it to @breaking\.jam in a DM/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Open Instagram" }),
    ).toHaveAttribute("href", "https://ig.me/m/breaking.jam");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Copy code" }),
    );
    expect(writeText).toHaveBeenCalledWith("BJ-7K2M");
    expect(await screen.findByText("Code copied")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const pending = screen.getByRole("button", {
      name: /Verification pending.*BJ-7K2M/,
    });
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();

    // Closed by mistake, the modal comes back from the pill, code and all.
    await userEvent.click(pending);
    const again = screen.getByRole("dialog", { name: "Verify it’s you" });
    expect(within(again).getByText("BJ-7K2M")).toBeInTheDocument();
    // A tap outside lands on the <dialog> itself, around its content.
    fireEvent.click(again);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /Verification pending/ }),
    );
    expect(
      screen.getByRole("dialog", { name: "Verify it’s you" }),
    ).toBeInTheDocument();
  });

  it("opens a claim still waiting, after a reload, from its pill", async () => {
    page(
      user,
      {},
      { [`GET /api/dancers/${ID}/claim`]: { status: 200, body: CLAIM } },
    );
    renderApp(`/dancers/${ID}`);

    await userEvent.click(
      await screen.findByRole("button", { name: /Verification pending/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Verify it’s you" });
    expect(within(dialog).getByText("BJ-7K2M")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copy code" }),
    ).toBeInTheDocument();
  });

  it("says why a page can't be claimed", async () => {
    page(
      user,
      {},
      {
        [`GET /api/dancers/${ID}/claim`]: NO_CLAIM,
        [`POST /api/dancers/${ID}/claim`]: {
          status: 409,
          body: {
            error: {
              code: "conflict",
              message: "you already own a dancer page",
            },
          },
        },
      },
    );
    renderApp(`/dancers/${ID}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "This is me" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "your account already has a page",
    );
  });

  it("offers no claim to an account that already has a verified page", async () => {
    const owner = {
      status: 200,
      body: {
        ...LIL_G,
        dancer: {
          ...DANCER,
          id: "01920000-0000-7000-8000-0000000000d2",
          deleted: false,
          verified: true,
        },
      },
    };
    const fetch = page(
      owner,
      {},
      { [`GET /api/dancers/${ID}/claim`]: NO_CLAIM },
    );
    renderApp(`/dancers/${ID}`);

    expect(
      await screen.findByRole("heading", { name: "Ventus" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("No upcoming jams.")).toBeInTheDocument();
    // Never asked: the API would refuse the claim (409).
    expect(calls(fetch)).not.toContain(`GET /api/dancers/${ID}/claim`);
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
  });

  it("warns, without refusing, when the new stage name is already someone's", async () => {
    page(
      user,
      { can_edit: true },
      {
        "GET /api/dancers": {
          status: 200,
          body: {
            items: [{ ...DANCER, id: "other", dancer_name: "Menno" }],
            next_cursor: null,
          },
        },
      },
    );
    renderApp(`/dancers/${ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    const dialog = within(screen.getByRole("dialog", { name: "Edit profile" }));
    // Someone else's unverified page: its edits are logged.
    expect(
      dialog.getByText(/Edits to this page are logged/),
    ).toBeInTheDocument();
    const name = dialog.getByLabelText("Stage name");
    await userEvent.clear(name);
    await userEvent.type(name, "menno");
    expect(
      await dialog.findByText(/Another dancer is already called Menno/),
    ).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("drops the logged-edits notice on one's own page", async () => {
    page(
      {
        status: 200,
        body: {
          ...LIL_G,
          dancer: { id: ID, dancer_name: "Ventus", verified: false },
        },
      },
      { can_edit: true },
    );
    renderApp(`/dancers/${ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    const dialog = within(screen.getByRole("dialog", { name: "Edit profile" }));
    expect(dialog.queryByText(/Edits to this page are logged/)).toBeNull();
  });

  it("lets whoever may edit change the profile and the avatar", async () => {
    const fetch = page(
      user,
      { can_edit: true, verified_at: at },
      {
        [`PUT /api/dancers/${ID}`]: {
          status: 200,
          body: { ...DANCER, verified_at: at, can_edit: true, city: "Lyon" },
        },
      },
    );
    renderApp(`/dancers/${ID}`);

    // An empty handle invites to fill it in (§4.23).
    await userEvent.click(
      await screen.findByRole("button", { name: "Add Instagram" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit profile" });
    const handle = within(dialog).getByLabelText(/^Instagram/);
    // Focus lands a frame after the sheet opens (Dialog).
    await waitFor(() => expect(handle).toHaveFocus());
    await userEvent.type(handle, "https://www.instagram.com/ventus_bj/");

    const aliases = within(dialog).getByLabelText(/^Also known as/);
    await userEvent.type(aliases, "Vent{Enter}V,");
    expect(
      within(dialog).getByRole("button", { name: "Remove Vent" }),
    ).toBeInTheDocument();
    const city = within(dialog).getByLabelText(/^City/);
    await userEvent.clear(city);
    await userEvent.type(city, "Lyon");
    // The avatar's parts left this form for the builder (AvatarBuilder.test.tsx).
    expect(within(dialog).queryByRole("combobox", { name: "Hair" })).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Change avatar" }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    // The account menu shows the owner's name and avatar: the session is read again.
    await waitFor(() =>
      expect(
        calls(fetch).filter((call) => call === "GET /api/auth/me"),
      ).toHaveLength(2),
    );
    const body = await bodyOf(fetch, `PUT /api/dancers/${ID}`);
    expect(body).toMatchObject({
      dancer_name: "Ventus",
      aliases: ["Vent", "V"],
      country: "FR",
      country2: null,
      city: "Lyon",
      instagram_handle: "ventus_bj",
      bio: null,
    });
    expect(body).not.toHaveProperty("real_name");
    // The avatar is the builder's to save: the profile names none, and the API keeps it.
    expect(body).not.toHaveProperty("avatar");
    // This editor may not say what the dancer does: the sheet sends no titles to keep.
    expect(body).not.toHaveProperty("titles");
    expect(within(dialog).queryByRole("group", { name: /I’m a/ })).toBeNull();
  });

  it("lets the verified owner hide their Instagram, and says so on their page", async () => {
    const mine = { ...LIL_G, dancer: { ...DANCER, verified: true } };
    const owned = {
      can_edit: true,
      can_set_titles: true,
      verified_at: at,
      instagram_handle: "ventus",
    };
    const fetch = page({ status: 200, body: mine }, owned, {
      [`PUT /api/dancers/${ID}`]: {
        status: 200,
        body: { ...DANCER, ...owned, instagram_hidden: true },
      },
    });
    renderApp(`/dancers/${ID}`);

    expect(
      await screen.findByRole("link", { name: "@ventus" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Hidden:/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const dialog = screen.getByRole("dialog", { name: "Edit profile" });
    const hide = within(dialog).getByRole("checkbox", {
      name: "Hide my Instagram from my page and from search",
    });
    expect(hide).not.toBeChecked();
    await userEvent.click(hide);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await bodyOf(fetch, `PUT /api/dancers/${ID}`)).toMatchObject({
      instagram_handle: "ventus",
      instagram_hidden: true,
    });
    // The owner is still sent the handle, with a word that visitors are not.
    expect(
      await screen.findByText(
        "Hidden: only you and the BreakingJam team see it.",
      ),
    ).toBeInTheDocument();
  });

  it("leaves hiding the Instagram to the dancer: a creator gets no checkbox", async () => {
    page({ status: 200, body: LIL_G }, { can_edit: true });
    renderApp(`/dancers/${ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    expect(
      screen.queryByRole("checkbox", { name: /Hide my Instagram/ }),
    ).not.toBeInTheDocument();
  });

  it("lets the verified dancer say what they do, shown on their page", async () => {
    const mine = {
      status: 200,
      body: {
        ...LIL_G,
        dancer: { ...DANCER, deleted: false, verified: true },
      },
    };
    const fetch = page(
      mine,
      {
        can_edit: true,
        can_set_titles: true,
        verified_at: at,
        titles: ["bgirl", "dj"],
      },
      {
        [`PUT /api/dancers/${ID}`]: {
          status: 200,
          body: { ...DANCER, verified_at: at, titles: ["bgirl", "breaker"] },
        },
      },
    );
    renderApp(`/dancers/${ID}`);

    expect(await screen.findByText("Bgirl · DJ")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    const dialog = screen.getByRole("dialog", { name: "Edit profile" });
    const titles = within(dialog).getByRole("group", { name: "I’m a…" });
    expect(titles).toHaveAccessibleDescription(
      "Only the dancer, once verified, and the BreakingJam team set these.",
    );
    const chip = (name: string) => within(titles).getByRole("button", { name });
    expect(chip("Bgirl")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Breaker")).toHaveAttribute("aria-pressed", "false");
    // Several at once; picked again, a title goes.
    await userEvent.click(chip("Breaker"));
    await userEvent.click(chip("DJ"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(await bodyOf(fetch, `PUT /api/dancers/${ID}`)).toMatchObject({
      titles: ["bgirl", "breaker"],
    });
  });

  it("keeps aliases apart, short, and the same country once", async () => {
    const fetch = page(
      user,
      { can_edit: true },
      {
        [`PUT /api/dancers/${ID}`]: {
          status: 200,
          body: { ...DANCER, can_edit: true },
        },
      },
    );
    renderApp(`/dancers/${ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    const dialog = within(screen.getByRole("dialog", { name: "Edit profile" }));
    const aliases = dialog.getByLabelText(/^Also known as/);
    // "vent" is "Vent" again; a value stops at 100 characters.
    await userEvent.type(aliases, `Vent,vent,${"L".repeat(120)},`);
    const chips = dialog.getAllByRole("button", { name: /^Remove / });
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Remove Vent",
      `Remove ${"L".repeat(100)}`,
    ]);
    // Removing a chip leaves the focus in the field, not nowhere.
    await userEvent.click(chips[1]!);
    expect(aliases).toHaveFocus();
    // Full, the field stays, to hold the focus and take Backspace.
    await userEvent.type(aliases, "b,c,d,e,f,");
    expect(dialog.getAllByRole("button", { name: /^Remove / })).toHaveLength(5);
    expect(aliases).toHaveFocus();
    await userEvent.keyboard("{Backspace}");
    expect(dialog.getAllByRole("button", { name: /^Remove / })).toHaveLength(4);

    await userEvent.selectOptions(
      dialog.getByLabelText(/^Second country/),
      "FR",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () =>
      expect(await bodyOf(fetch, `PUT /api/dancers/${ID}`)).toMatchObject({
        aliases: ["Vent", "b", "c", "d"],
        country: "FR",
        country2: null,
      }),
    );
  });

  it("says so when a save fails, whatever the server answers", async () => {
    page(
      user,
      { can_edit: true },
      {
        // A proxy's error page, not the API's envelope.
        [`PUT /api/dancers/${ID}`]: { status: 502, text: "Bad gateway" },
      },
    );
    renderApp(`/dancers/${ID}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );
    const dialog = within(screen.getByRole("dialog", { name: "Edit profile" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Something went wrong",
    );
  });

  it("lists claims for admins, who approve them after checking Instagram", async () => {
    const queue = {
      items: [
        {
          ...CLAIM,
          dancer: {
            id: ID,
            dancer_name: "Ventus",
            country: "FR",
            instagram_handle: "ventus_bj",
          },
          user: { id: LIL_G.id, email: LIL_G.email, display_name: "Lil G" },
        },
      ],
      next_cursor: null,
    };
    const fetch = mockApi({
      "GET /api/auth/me": admin,
      "GET /api/admin/claims": (n) => ({
        status: 200,
        body: n === 0 ? queue : { items: [], next_cursor: null },
      }),
      [`POST /api/admin/claims/${CLAIM.id}/approve`]: {
        status: 200,
        body: { ...CLAIM, status: "approved" },
      },
    });
    renderApp("/admin/claims");

    expect(
      await screen.findByRole("link", { name: "@ventus_bj" }),
    ).toHaveAttribute("href", "https://instagram.com/ventus_bj");
    expect(screen.getByText("BJ-7K2M")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Ventus is verified.")).toBeInTheDocument();
    expect(await screen.findByText("No claims waiting.")).toBeInTheDocument();
    expect(calls(fetch)).toContain(
      `POST /api/admin/claims/${CLAIM.id}/approve`,
    );
    // An admin may have approved their own claim: their menu then links the page.
    await waitFor(() =>
      expect(
        calls(fetch).filter((call) => call === "GET /api/auth/me"),
      ).toHaveLength(2),
    );
  });

  it("merges a duplicate into the dancer who stays", async () => {
    const SURVIVOR = {
      ...DANCER,
      id: "01920000-0000-7000-8000-0000000000d2",
      dancer_name: "Ventus Prime",
    };
    const fetch = mockApi({
      "GET /api/auth/me": admin,
      [`GET /api/dancers/${ID}`]: { status: 200, body: DANCER },
      [`GET /api/dancers/${SURVIVOR.id}`]: { status: 200, body: SURVIVOR },
      [`GET /api/dancers/${SURVIVOR.id}/events`]: NO_EVENTS,
      "GET /api/dancers": {
        status: 200,
        body: { items: [{ ...SURVIVOR, verified: false }], next_cursor: null },
      },
      [`POST /api/admin/dancers/${ID}/merge`]: {
        status: 200,
        body: {
          merged_into: SURVIVOR.id,
          aliases: ["Ventus"],
          instagram_handle: null,
        },
      },
    });
    renderApp(`/admin/dancers/${ID}/merge`);

    await userEvent.type(await screen.findByLabelText("Keep"), "ventus");
    await userEvent.click(
      await screen.findByRole("button", { name: /Ventus Prime/ }),
    );
    expect(
      screen.getByText(
        /Ventus’s jams, roles, crews and claims move to Ventus Prime/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ventus Prime" }),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, `POST /api/admin/dancers/${ID}/merge`)).toEqual({
      into: SURVIVOR.id,
    });
  });

  it("hides admin screens from everyone else", async () => {
    mockApi({ "GET /api/auth/me": user });
    renderApp("/admin/claims");

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
