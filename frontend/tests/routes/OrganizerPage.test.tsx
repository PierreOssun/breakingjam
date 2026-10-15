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
const ID = LIL_G.id;
const ORGANIZER = {
  id: ID,
  display_name: "Floor Lords e.V.",
  instagram_handle: "floor.lords",
  country: "FR",
  city: "Paris",
  bio: "Jams in Paris since 2012.",
  verified_at: at,
  can_edit: false,
};
const jam = (n: number, startsOn: string, status: string) => ({
  id: `jam-${n}`,
  name: `Jam ${n}`,
  slug: `jam-${n}`,
  starts_on: startsOn,
  ends_on: startsOn,
  city: "Paris",
  country: "FR",
  status,
});
const EVENTS = {
  status: 200,
  body: {
    upcoming: [jam(1, "2030-06-01", "published")],
    past: [
      jam(2, "2025-06-01", "completed"),
      jam(3, "2024-06-01", "cancelled"),
    ],
  },
};
const NO_CLAIM = {
  status: 404,
  body: { error: { code: "not_found", message: "no claim" } },
};
type Replies = Parameters<typeof mockApi>[0];

function page(
  me: Replies[string],
  organizer: object = {},
  replies: Replies = {},
) {
  return mockApi({
    "GET /api/auth/me": me,
    [`GET /api/organizers/${ID}`]: {
      status: 200,
      body: { ...ORGANIZER, ...organizer },
    },
    [`GET /api/organizers/${ID}/events`]: EVENTS,
    ...replies,
  });
}
const owner = { status: 200, body: { ...LIL_G, role: "organizer" } };

describe("OrganizerPage", () => {
  it("shows who runs the jams, and their jams without battles", async () => {
    page(LOGGED_OUT);
    renderApp(`/organizers/${ID}`);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Floor Lords e.V.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Verified" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "France" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@floor.lords" })).toHaveAttribute(
      "href",
      "https://instagram.com/floor.lords",
    );
    expect(screen.getByText("Jams in Paris since 2012.")).toBeInTheDocument();

    const past = screen
      .getByRole("heading", { name: "Past" })
      .closest("section")!;
    const rows = await within(past).findAllByRole("link");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual([
      "/jams/jam-2",
      "/jams/jam-3",
    ]);
    expect(within(rows[1]!).getByText("Cancelled")).toBeInTheDocument();
    // Visitors get no actions.
    expect(screen.queryByRole("button", { name: "Edit page" })).toBeNull();
  });

  it("lets the organiser add a handle, then verify it with a code", async () => {
    const fetch = page(
      owner,
      { can_edit: true, instagram_handle: null, verified_at: null },
      {
        [`GET /api/organizers/${ID}/claim`]: NO_CLAIM,
        [`PUT /api/organizers/${ID}`]: {
          status: 200,
          body: {
            ...ORGANIZER,
            verified_at: null,
            instagram_handle: "floor.lords",
            can_edit: true,
          },
        },
        [`POST /api/organizers/${ID}/claim`]: {
          status: 200,
          body: {
            id: "c1",
            user_id: ID,
            instagram_handle: "floor.lords",
            code: "BJ-7K2M",
            status: "pending",
            created_at: at,
          },
        },
      },
    );
    renderApp(`/organizers/${ID}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add Instagram" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Edit page" });
    const handle = within(sheet).getByLabelText(/^Instagram/);
    expect(handle).toHaveFocus();
    await userEvent.type(handle, "@Floor.Lords");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Page saved.")).toBeInTheDocument();
    expect(await bodyOf(fetch, `PUT /api/organizers/${ID}`)).toEqual({
      display_name: "Floor Lords e.V.",
      instagram_handle: "Floor.Lords",
      country: "FR",
      city: "Paris",
      bio: "Jams in Paris since 2012.",
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Verify Instagram" }),
    );
    const verify = screen.getByRole("dialog", { name: "Verify it’s you" });
    expect(within(verify).getByText("BJ-7K2M")).toBeInTheDocument();
    await userEvent.click(within(verify).getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: /Verification pending.*BJ-7K2M/ }),
    ).toBeInTheDocument();
  });

  it("is a not-found page for accounts without jams", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp(`/organizers/${ID}`);

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("puts organiser claims in the admin queue", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": { status: 200, body: { ...LIL_G, role: "admin" } },
      "GET /api/admin/claims": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      "GET /api/admin/organizer-claims": {
        status: 200,
        body: {
          items: [
            {
              id: "c1",
              user_id: ID,
              instagram_handle: "floor.lords",
              code: "BJ-7K2M",
              status: "pending",
              created_at: at,
              user: {
                id: ID,
                email: LIL_G.email,
                display_name: "Floor Lords e.V.",
              },
            },
          ],
          next_cursor: null,
        },
      },
      "POST /api/admin/organizer-claims/c1/approve": {
        status: 200,
        body: { status: "approved" },
      },
    });
    renderApp("/admin/claims");

    const organisers = (
      await screen.findByRole("heading", { name: "Organisers" })
    ).closest("section")!;
    expect(
      await within(organisers).findByRole("link", { name: "Floor Lords e.V." }),
    ).toHaveAttribute("href", `/organizers/${ID}`);
    await userEvent.click(
      within(organisers).getByRole("button", { name: "Approve" }),
    );
    expect(
      await screen.findByText("Floor Lords e.V. is verified."),
    ).toBeInTheDocument();
    expect(calls(fetch)).toContain(
      "POST /api/admin/organizer-claims/c1/approve",
    );
  });
});
