import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, bodyOf, mockApi, renderApp } from "../support/app";

const ME = { status: 200, body: { ...LIL_G, role: "organizer" } };
const at = "2026-10-01T10:00:00Z";
const ID = "01920000-0000-7000-8000-00000000e001";

const jam = (extra: object = {}) => ({
  id: ID,
  organizer_id: LIL_G.id,
  name: "Paris Cypher",
  slug: "paris-cypher-00e001",
  status: "draft",
  starts_on: "2030-06-01",
  ends_on: "2030-06-02",
  timezone: "Europe/Paris",
  city: "Paris",
  country: "FR",
  created_at: at,
  updated_at: at,
  ...extra,
});

describe("the organiser's jams", () => {
  it("lists your jams, drafts included, each opening its editor", async () => {
    mockApi({
      "GET /api/auth/me": ME,
      "GET /api/events": {
        status: 200,
        body: {
          items: [
            jam(),
            jam({ id: "e2", name: "Zurich Jam", status: "published" }),
            // A draft fresh from the start sheet has no place yet.
            jam({ id: "e3", name: "Winter Cypher", city: null, country: null }),
          ],
          next_cursor: null,
        },
      },
    });
    renderApp("/org/jams");

    const row = await screen.findByRole("link", { name: /^Paris Cypher/ });
    expect(row).toHaveAttribute("href", `/org/jams/${ID}/edit`);
    expect(within(row).getByText("Draft")).toBeInTheDocument();
    expect(
      within(screen.getByRole("link", { name: /^Zurich Jam/ })).getByText(
        "Published",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Winter Cypher/ }),
    ).toBeInTheDocument();
  });

  it("invites you to register a first jam", async () => {
    mockApi({
      "GET /api/auth/me": ME,
      "GET /api/events": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    renderApp("/org/jams");

    expect(
      await screen.findByRole("heading", { name: "No jams yet" }),
    ).toBeInTheDocument();
  });
});

describe("the start sheet", () => {
  const empty = { status: 200, body: { items: [], next_cursor: null } };

  it("makes a draft from a name and a first day, then opens its page in edit mode", async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      "GET /api/auth/me": { status: 200, body: LIL_G },
      "GET /api/events": empty,
      "POST /api/events": {
        status: 201,
        body: jam({ city: null, country: null }),
      },
    });
    const router = renderApp("/org/jams/new");

    expect(
      await screen.findByRole("dialog", { name: "Register a jam" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Jam name"), "Winter Cypher Jam");
    await user.type(screen.getByLabelText("First day"), "2030-12-12");
    await user.click(
      screen.getByRole("button", { name: "Create the jam page" }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/org/jams/${ID}/edit`),
    );
    expect(await bodyOf(fetch, "POST /api/events")).toMatchObject({
      name: "Winter Cypher Jam",
      starts_on: "2030-12-12",
      ends_on: "2030-12-12",
      city: null,
      country: null,
      lat: null,
    });
  });

  it("asks for both before creating anything", async () => {
    const user = userEvent.setup();
    const fetch = mockApi({
      "GET /api/auth/me": { status: 200, body: LIL_G },
      "GET /api/events": empty,
    });
    renderApp("/org/jams/new");

    await user.click(
      await screen.findByRole("button", { name: "Create the jam page" }),
    );
    expect(await screen.findAllByText("Required.")).toHaveLength(2);
    expect(
      fetch.mock.calls.some(([input]) => (input as Request).method === "POST"),
    ).toBe(false);
  });

  it("closes back to the list", async () => {
    const user = userEvent.setup();
    mockApi({ "GET /api/auth/me": ME, "GET /api/events": empty });
    const router = renderApp("/org/jams/new");

    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/org/jams"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
