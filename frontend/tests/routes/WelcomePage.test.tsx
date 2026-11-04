import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, bodyOf, calls, mockApi, renderApp } from "../support/app";

// A page's code loads on demand, as in the browser: slow enough that `me` comes back first.
vi.mock(import("../../src/routes/DancerPage"), async (original) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return original();
});

const ME = { status: 200, body: LIL_G };
const PAGE_ID = "01920000-0000-7000-8000-0000000000e1";
const NONE = { status: 200, body: { items: [], next_cursor: null } };

/** A search result, as `GET /api/dancers` lists it. */
const person = (id: string, name: string) => ({
  id,
  dancer_name: name,
  aliases: [],
  country: "FR",
  country2: null,
  city: "Paris",
  instagram_handle: null,
  verified: false,
  avatar_url: null,
  avatar_parts: null,
  crews: [],
});

/** The page `POST /api/dancers/mine` returns, unverified. */
const created = {
  ...person(PAGE_ID, "Lil G"),
  bio: null,
  source: "self",
  verified_at: null,
  merged_into_id: null,
  titles: [],
  created_at: "2026-11-03T10:00:00Z",
  updated_at: "2026-11-03T10:00:00Z",
  can_edit: true,
  can_set_titles: false,
};

describe("WelcomePage", () => {
  it("looks for the account's page by its name, each match leading to its page", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": ME,
      "GET /api/dancers": {
        status: 200,
        body: { items: [person("d1", "Lil G")], next_cursor: null },
      },
    });
    renderApp("/welcome?next=%2Fjams");

    expect(
      await screen.findByRole("heading", { name: "Are you on BreakingJam?" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your name in the scene")).toHaveValue(
      "Lil G",
    );
    const found = await screen.findByRole("list", { name: "Pages that match" });
    expect(within(found).getByRole("link", { name: /Lil G/ })).toHaveAttribute(
      "href",
      "/dancers/d1",
    );
    const search = fetch.mock.calls
      .map(([input]) => new URL((input as Request).url))
      .find((url) => url.pathname === "/api/dancers");
    expect(search?.searchParams.get("q")).toBe("Lil G");
  });

  it("makes the account's page only once a search has run, then opens it", async () => {
    const fetch = mockApi({
      // Read again once the page exists, `me` has it.
      "GET /api/auth/me": (n) =>
        n === 0
          ? ME
          : {
              status: 200,
              body: {
                ...LIL_G,
                dancer: { ...created, deleted: false, verified: false },
              },
            },
      "GET /api/dancers": NONE,
      "POST /api/dancers/mine": { status: 201, body: created },
      [`GET /api/dancers/${PAGE_ID}`]: { status: 200, body: created },
      [`GET /api/dancers/${PAGE_ID}/events`]: {
        status: 200,
        body: { live: [], upcoming: [], past: [] },
      },
    });
    const router = renderApp("/welcome?next=%2F");

    const create = await screen.findByRole("button", {
      name: "Create my page",
    });
    expect(
      await screen.findByText("No page matches “Lil G” yet."),
    ).toBeInTheDocument();
    expect(create).toBeEnabled();
    // A blank search has looked for nothing yet.
    await userEvent.clear(screen.getByLabelText("Your name in the scene"));
    await waitFor(() => expect(create).toBeDisabled());
    await userEvent.type(
      screen.getByLabelText("Your name in the scene"),
      "Lil G",
    );
    await waitFor(() => expect(create).toBeEnabled());

    await userEvent.click(create);
    const form = screen.getByRole("group", { name: "Create my page" });
    expect(within(form).getByLabelText("Stage name")).toHaveValue("Lil G");
    await userEvent.selectOptions(within(form).getByLabelText("Country"), "FR");
    await userEvent.click(within(form).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/dancers/${PAGE_ID}`),
    );
    expect(await bodyOf(fetch, "POST /api/dancers/mine")).toEqual({
      dancer_name: "Lil G",
      country: "FR",
      instagram_handle: null,
    });
    // The account menu learns of its page, and the new page stays: knowing the account has
    // a page must not send it on to `next` instead.
    await waitFor(() =>
      expect(
        calls(fetch).filter((call) => call === "GET /api/auth/me"),
      ).toHaveLength(2),
    );
    expect(
      await screen.findByRole("heading", { name: "Lil G" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/dancers/${PAGE_ID}`);
  });

  it("says the account already has a page, and reads it again, when another tab made one", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": ME,
      "GET /api/dancers": NONE,
      "POST /api/dancers/mine": {
        status: 409,
        body: {
          error: {
            code: "conflict",
            message: "this account already has a page",
          },
        },
      },
    });
    renderApp("/welcome?next=%2F");

    const create = await screen.findByRole("button", {
      name: "Create my page",
    });
    await waitFor(() => expect(create).toBeEnabled());
    await userEvent.click(create);
    const form = screen.getByRole("group", { name: "Create my page" });
    await userEvent.selectOptions(within(form).getByLabelText("Country"), "FR");
    await userEvent.click(within(form).getByRole("button", { name: "Create" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "This account already has a page.",
    );
    await waitFor(() =>
      expect(
        calls(fetch).filter((call) => call === "GET /api/auth/me"),
      ).toHaveLength(2),
    );
  });

  it("goes on where the account was going when skipped", async () => {
    mockApi({ "GET /api/auth/me": ME, "GET /api/dancers": NONE });
    const router = renderApp("/welcome?next=%2Fjams%3Fq%3Dzurich");

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Skip, I’m just here for the jams",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/jams"));
    expect(router.state.location.search).toBe("?q=zurich");
  });

  it("lets an account that has its page go straight on, and never off the site", async () => {
    mockApi({
      "GET /api/auth/me": {
        status: 200,
        body: {
          ...LIL_G,
          dancer: {
            ...person(PAGE_ID, "Lil G"),
            deleted: false,
            verified: false,
          },
        },
      },
      "GET /api/dancers": NONE,
    });
    const router = renderApp("/welcome?next=https%3A%2F%2Fevil.example");

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
