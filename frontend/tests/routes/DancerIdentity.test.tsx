import { screen, within } from "@testing-library/react";
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
  real_name: "Victor V.",
  country: "FR",
  country2: null,
  city: "Paris",
  bio: null,
  instagram_handle: null,
  source: "organizer",
  verified_at: null,
  avatar_url: null,
  avatar_parts: null,
  merged_into_id: null,
  created_at: at,
  updated_at: at,
  crews: [],
  can_edit: false,
};
const NO_EVENTS = { status: 200, body: { upcoming: [], past: [] } };
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
    expect(
      screen.getByRole("button", { name: /Verification pending.*BJ-7K2M/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
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
    expect(handle).toHaveFocus();
    await userEvent.type(handle, "https://www.instagram.com/ventus_bj/");

    const aliases = within(dialog).getByLabelText(/^Also known as/);
    await userEvent.type(aliases, "Vent{Enter}V,");
    expect(
      within(dialog).getByRole("button", { name: "Remove Vent" }),
    ).toBeInTheDocument();
    const city = within(dialog).getByLabelText(/^City/);
    await userEvent.clear(city);
    await userEvent.type(city, "Lyon");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Skin tone"),
      "3",
    );
    await userEvent.selectOptions(within(dialog).getByLabelText("Hair"), "4");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    const body = await bodyOf(fetch, `PUT /api/dancers/${ID}`);
    expect(body).toMatchObject({
      dancer_name: "Ventus",
      aliases: ["Vent", "V"],
      real_name: "Victor V.",
      country: "FR",
      country2: null,
      city: "Lyon",
      instagram_handle: "ventus_bj",
      bio: null,
    });
    expect(body.avatar_parts).toMatch(/^h4-s3-c\d-o\d-e\d-b\d$/);
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
