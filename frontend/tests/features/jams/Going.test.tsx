import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LIL_G,
  LOGGED_OUT,
  calls,
  mockApi,
  renderApp,
} from "../../support/app";

vi.mock("../../../src/features/map/StaticMap", () => ({
  default: () => <div>Venue map</div>,
}));

const at = "2026-10-01T10:00:00Z";
const ID = "01920000-0000-7000-8000-00000000e001";
const SLUG = "winter-cypher-00e001";
const JAM = {
  id: ID,
  organizer_id: "01920000-0000-7000-8000-0000000000a1",
  name: "Winter Cypher",
  slug: SLUG,
  description: null,
  status: "published",
  phase: "upcoming",
  starts_on: "2030-12-14",
  ends_on: "2030-12-14",
  timezone: "Europe/Zurich",
  opens_at: "14:00:00",
  closes_at: "21:00:00",
  venue_name: null,
  address: null,
  city: "Zürich",
  country: "CH",
  lat: null,
  lng: null,
  registration_url: null,
  instagram_url: null,
  website_url: null,
  contact_email: "crew@example.com",
  created_at: at,
  updated_at: at,
  can_edit: false,
  can_edit_battles: false,
  actions: [],
  organizer: null,
  going_count: 41,
  going: false,
  takes_attendees: true,
  takes_entries: true,
};
const GOING = `/api/events/${ID}/going`;

type Replies = Parameters<typeof mockApi>[0];

function jamPage(
  me: Replies[string],
  jam: object = {},
  replies: Replies = {},
  path = `/jams/${SLUG}`,
) {
  const fetch = mockApi({
    "GET /api/auth/me": me,
    [`GET /api/events/${SLUG}`]: { status: 200, body: { ...JAM, ...jam } },
    [`GET /api/events/${ID}/battles`]: { status: 200, body: [] },
    [`GET /api/events/${ID}/staff`]: { status: 200, body: [] },
    "GET /api/events": { status: 200, body: { items: [], next_cursor: null } },
    ...replies,
  });
  const router = renderApp(path);
  return { fetch, router };
}

const main = async () => within(await screen.findByRole("main"));
const SIGNED_IN = { status: 200, body: LIL_G };

describe("I'm going", () => {
  it("counts the tap at once, then offers the calendar and the crew", async () => {
    const { fetch } = jamPage(
      SIGNED_IN,
      {},
      {
        [`PUT ${GOING}`]: {
          status: 200,
          body: { going_count: 42, going: true },
        },
      },
    );
    const page = await main();
    expect(await page.findByText("41 going")).toBeInTheDocument();

    await userEvent.click(page.getByRole("button", { name: "I’m going" }));

    expect(calls(fetch)).toContain(`PUT ${GOING}`);
    const sheet = within(
      await screen.findByRole("dialog", { name: "See you on Sat 14 Dec" }),
    );
    expect(
      sheet.getByText("Winter Cypher · Zürich · 14:00–21:00"),
    ).toBeVisible();
    expect(
      sheet.getByRole("link", { name: "Add to calendar" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(new RegExp(`/api/events/${SLUG}/calendar\\.ics$`)),
    );
    expect(
      sheet.getByRole("button", { name: "Share with your crew" }),
    ).toBeInTheDocument();
    expect(
      sheet.getByText(
        "Only verified dancers are named. Everyone else is just counted.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(sheet.getByRole("button", { name: "Close" }));
    expect(
      page.getByRole("button", { name: "You’re going" }),
    ).toBeInTheDocument();
    expect(page.getByText("42 going")).toBeInTheDocument();
  });

  it("takes it back from the sheet", async () => {
    const { fetch } = jamPage(
      SIGNED_IN,
      { going: true, going_count: 3 },
      {
        [`DELETE ${GOING}`]: {
          status: 200,
          body: { going_count: 2, going: false },
        },
      },
    );
    const page = await main();

    await userEvent.click(
      await page.findByRole("button", { name: "You’re going" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "I’m not going any more" }),
    );

    expect(calls(fetch)).toContain(`DELETE ${GOING}`);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      await page.findByRole("button", { name: "I’m going" }),
    ).toBeInTheDocument();
    expect(page.getByText("2 going")).toBeInTheDocument();
  });

  it("goes back to how it was when the save fails", async () => {
    jamPage(
      SIGNED_IN,
      {},
      {
        [`PUT ${GOING}`]: {
          status: 500,
          body: { error: { code: "internal", message: "internal" } },
        },
      },
    );
    const page = await main();

    await userEvent.click(
      await page.findByRole("button", { name: "I’m going" }),
    );

    expect(
      await screen.findByText("Couldn’t save that. Try again."),
    ).toBeInTheDocument();
    // The sheet closes with the failure, so the toast isn't hidden under it.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(page.getByRole("button", { name: "I’m going" })).toBeInTheDocument();
    expect(page.getByText("41 going")).toBeInTheDocument();
  });

  it("sends a visitor to log in, and back to the jam", async () => {
    const visitor = jamPage(LOGGED_OUT);
    await userEvent.click(
      await (await main()).findByRole("button", { name: "I’m going" }),
    );
    await waitFor(() =>
      expect(visitor.router.state.location.pathname).toBe("/login"),
    );
    expect(
      new URLSearchParams(visitor.router.state.location.search).get("next"),
    ).toBe(`/jams/${SLUG}?going=1`);
  });

  it("applies the tap that sent them to log in, once", async () => {
    const { fetch, router } = jamPage(
      SIGNED_IN,
      {},
      {
        [`PUT ${GOING}`]: {
          status: 200,
          body: { going_count: 42, going: true },
        },
      },
      `/jams/${SLUG}?going=1`,
    );

    expect(
      await screen.findByRole("dialog", { name: "See you on Sat 14 Dec" }),
    ).toBeInTheDocument();
    expect(calls(fetch).filter((c) => c === `PUT ${GOING}`)).toHaveLength(1);
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("sits beside the organiser's registration link", async () => {
    jamPage(LOGGED_OUT, { registration_url: "https://example.com/register" });
    const page = await main();

    const going = await page.findByRole("button", { name: "I’m going" });
    const register = page
      .getAllByRole("link", { name: /Register to battle/ })
      .find((link) => link.parentElement === going.parentElement);
    expect(register).toHaveAttribute("href", "https://example.com/register");
  });

  it.each([
    ["past", { phase: "past", takes_attendees: false }],
    ["cancelled", { status: "cancelled", takes_attendees: false }],
    ["draft", { status: "draft", can_edit: true, takes_attendees: false }],
  ])("is not on a %s jam", async (_state, jam) => {
    jamPage(SIGNED_IN, jam);
    const page = await main();
    await page.findByRole("heading", { level: 1, name: "Winter Cypher" });

    expect(page.queryByRole("button", { name: "I’m going" })).toBeNull();
    expect(page.queryByText("41 going")).toBeNull();
  });

  it("hides the count while no one is going", async () => {
    jamPage(LOGGED_OUT, { going_count: 0 });
    const page = await main();
    await page.findByRole("button", { name: "I’m going" });

    expect(page.queryByText(/^\d+ going$/)).toBeNull();
  });

  it("names the verified dancers going, and counts the rest", async () => {
    jamPage(
      LOGGED_OUT,
      {},
      {
        [`GET ${GOING}`]: {
          status: 200,
          body: {
            going_count: 41,
            others: 40,
            dancers: [
              {
                id: "01920000-0000-7000-8000-0000000000d1",
                dancer_name: "Nova",
                country: "CH",
                country2: null,
                instagram_handle: null,
                avatar_url: null,
                avatar: null,
                deleted: false,
              },
            ],
          },
        },
      },
    );
    const page = await main();

    await userEvent.click(
      await page.findByRole("button", { name: "41 going" }),
    );

    const sheet = within(
      await screen.findByRole("dialog", { name: "Who’s going" }),
    );
    expect(await sheet.findByRole("link", { name: "Nova" })).toHaveAttribute(
      "href",
      "/dancers/01920000-0000-7000-8000-0000000000d1",
    );
    expect(sheet.getByText("and 40 others")).toBeInTheDocument();
  });
});
