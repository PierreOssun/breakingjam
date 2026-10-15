import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, bodyOf, calls, mockApi, renderApp } from "../test/app";

// jsdom has no WebGL: the pin map is a button that drops a pin and shows where it is.
vi.mock("../features/map/PinMap", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: { lng: number; lat: number } | null;
    onChange: (v: { lng: number; lat: number }) => void;
  }) => (
    <button type="button" onClick={() => onChange({ lng: 2.35, lat: 48.86 })}>
      Pin at {value ? `${value.lat},${value.lng}` : "nowhere"}
    </button>
  ),
}));

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
  lat: null,
  lng: null,
  created_at: at,
  updated_at: at,
  ...extra,
});

const battle = (extra: object = {}) => ({
  id: "01920000-0000-7000-8000-0000000b0001",
  event_id: ID,
  name: "1v1 Bboy",
  format: "team",
  team_size: 1,
  gender: "bboy",
  age: "adult",
  age_min: 18,
  max_entries: 16,
  position: 0,
  created_at: at,
  updated_at: at,
  ...extra,
});

const dancer = {
  id: "01920000-0000-7000-8000-0000000d0001",
  dancer_name: "Atlas",
  aliases: [],
  country: "CH",
  instagram_handle: "atlas_bj",
  verified: false,
  crews: [{ id: "c1", name: "Alpine Breakers" }],
};

/** The edit page's API: the jam, its battles, entries and staff. */
function editApi(replies: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /api/auth/me": ME,
    [`GET /api/events/${ID}`]: {
      status: 200,
      body: { ...jam(), can_edit: true },
    },
    [`GET /api/events/${ID}/battles`]: { status: 200, body: [] },
    [`GET /api/events/${ID}/staff`]: { status: 200, body: [] },
    ...replies,
  });
}

describe("organiser pages", () => {
  it("lists your jams, drafts included, each opening its editor", async () => {
    mockApi({
      "GET /api/auth/me": ME,
      "GET /api/events": {
        status: 200,
        body: {
          items: [
            jam(),
            jam({ id: "e2", name: "Zurich Jam", status: "published" }),
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

  it("checks a new jam, finds its address, then saves a draft and opens it", async () => {
    const fetch = editApi({
      "GET /search": {
        status: 200,
        body: [
          {
            lat: "48.8566",
            lon: "2.3522",
            display_name: "12, Rue des Arts, Paris, France",
            address: { city: "Paris", country_code: "fr" },
          },
        ],
      },
      "POST /api/events": { status: 201, body: jam() },
    });
    renderApp("/org/jams/new");
    await screen.findByRole("button", { name: "Save draft" });
    const main = within(screen.getByRole("main"));

    await userEvent.click(main.getByRole("button", { name: "Save draft" }));
    expect(main.getByLabelText("Jam name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(calls(fetch)).not.toContain("POST /api/events");

    await userEvent.type(main.getByLabelText("Jam name"), "  Paris Cypher ");
    await userEvent.type(main.getByLabelText("First day"), "2030-06-02");
    await userEvent.type(main.getByLabelText("Last day"), "2030-06-01");
    await userEvent.type(main.getByLabelText(/^Address/), "12 Rue des Arts");
    await userEvent.type(main.getByLabelText("City"), "Paris");
    await userEvent.click(main.getByRole("button", { name: "Save draft" }));
    expect(
      await main.findByText("The last day can’t be before the first."),
    ).toBeInTheDocument();
    await userEvent.clear(main.getByLabelText("Last day"));
    await userEvent.type(main.getByLabelText("Last day"), "2030-06-02");

    // The search fills the empty country and drops the pin.
    await userEvent.click(
      main.getByRole("button", { name: "Find on the map" }),
    );
    expect(
      await main.findByRole("button", { name: "Pin at 48.8566,2.3522" }),
    ).toBeInTheDocument();
    expect(main.getByLabelText("Country")).toHaveValue("FR");

    await userEvent.click(main.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Paris Cypher" }),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, "POST /api/events")).toMatchObject({
      name: "Paris Cypher",
      starts_on: "2030-06-02",
      ends_on: "2030-06-02",
      address: "12 Rue des Arts",
      city: "Paris",
      country: "FR",
      lat: 48.8566,
      lng: 2.3522,
      venue_name: null,
      registration_url: null,
    });
  });

  it("shows another organiser's jam as not found", async () => {
    mockApi({
      "GET /api/auth/me": ME,
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: { ...jam({ status: "published" }), can_edit: false },
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("publishes a draft and saves its details", async () => {
    const fetch = editApi({
      [`POST /api/events/${ID}/publish`]: {
        status: 200,
        body: jam({ status: "published" }),
      },
      [`PUT /api/events/${ID}`]: {
        status: 200,
        body: jam({ name: "Paris Cypher Vol. 2" }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const status = await screen.findByRole("region", { name: /Status/ });
    expect(
      within(status).getByText(
        "Add a pin under “On the map” so dancers find it.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(status).getByRole("button", { name: "Publish" }),
    );
    expect(await within(status).findByText("Published")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Published. It’s on the map.",
    );

    const name = screen.getByLabelText("Jam name");
    await userEvent.clear(name);
    await userEvent.type(name, "Paris Cypher Vol. 2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await bodyOf(fetch, `PUT /api/events/${ID}`)).toMatchObject({
      name: "Paris Cypher Vol. 2",
      timezone: "Europe/Paris",
    });
  });

  it("adds a battle named from its fields", async () => {
    const fetch = editApi({
      [`GET /api/events/${ID}/battles`]: (n) => ({
        status: 200,
        body: n === 0 ? [] : [battle({ name: "2v2 Mixed Kids" })],
      }),
      [`POST /api/events/${ID}/battles`]: { status: 201, body: battle() },
    });
    renderApp(`/org/jams/${ID}/edit`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a battle" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add a battle" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Size"), "2");
    await userEvent.selectOptions(within(dialog).getByLabelText("Age"), "kids");
    expect(within(dialog).getByLabelText(/^Name/)).toHaveAttribute(
      "placeholder",
      "2v2 Mixed Kids",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("heading", { name: "2v2 Mixed Kids" }),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, `POST /api/events/${ID}/battles`)).toEqual({
      name: null,
      format: "team",
      team_size: 2,
      gender: "mixed",
      age: "kids",
      age_min: 8,
      age_max: 17,
      bracket_size: null,
      max_entries: null,
    });
  });

  it("creates a dancer only after searching, then registers the entry", async () => {
    const created = {
      ...dancer,
      id: "01920000-0000-7000-8000-0000000d0002",
      dancer_name: "Lil G",
      country: "FR",
      instagram_handle: null,
      crews: [],
      can_edit: true,
    };
    const fetch = editApi({
      [`GET /api/events/${ID}/battles`]: { status: 200, body: [battle()] },
      "GET /api/battles/01920000-0000-7000-8000-0000000b0001/entries": {
        status: 200,
        body: [],
      },
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      "POST /api/dancers": { status: 201, body: created },
      "POST /api/battles/01920000-0000-7000-8000-0000000b0001/entries": {
        status: 201,
        body: {},
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    await userEvent.click(
      await screen.findByRole("button", { name: "0 entries" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add an entry" }));
    const dialog = screen.getByRole("dialog", { name: "Add an entry" });
    const create = within(dialog).getByRole("button", {
      name: "Create a new dancer",
    });
    expect(create).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText("Dancer"), "Lil");
    expect(
      await within(dialog).findByText("Nothing found for “Lil”."),
    ).toBeInTheDocument();
    await userEvent.click(create);
    const name = within(dialog).getByLabelText("Dancer name");
    expect(name).toHaveValue("Lil");
    await userEvent.type(name, " G");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Country"),
      "FR",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create" }),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Remove Lil G" }),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, "POST /api/dancers")).toEqual({
      dancer_name: "Lil G",
      country: "FR",
      instagram_handle: null,
    });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Entry saved.")).toBeInTheDocument();
    expect(
      await bodyOf(
        fetch,
        "POST /api/battles/01920000-0000-7000-8000-0000000b0001/entries",
      ),
    ).toMatchObject({
      dancer_ids: [created.id],
      status: "confirmed",
      reached: "na",
      team_name: null,
      crew_id: null,
    });
  });

  it("adds a judge to the lineup from a search", async () => {
    const fetch = editApi({
      "GET /api/dancers": {
        status: 200,
        body: { items: [dancer], next_cursor: null },
      },
      [`PUT /api/events/${ID}/staff`]: {
        status: 200,
        body: [{ role: "judge", dancer }],
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    await userEvent.type(
      await screen.findByLabelText("Add to the lineup"),
      "atl",
    );
    // Search results tell namesakes apart: @handle, country, crew.
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Atlas.*@atlas_bj.*CH.*Alpine Breakers/,
      }),
    );

    expect(await bodyOf(fetch, `PUT /api/events/${ID}/staff`)).toEqual([
      { dancer_id: dancer.id, role: "judge" },
    ]);
    const judges = await screen.findByRole("heading", { name: "Judges" });
    expect(judges.nextElementSibling).toHaveTextContent("Atlas");
  });
});
