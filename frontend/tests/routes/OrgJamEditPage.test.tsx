import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, bodyOf, calls, mockApi, renderApp } from "../support/app";
import { freezeToday } from "../support/jams";

// jsdom has no WebGL: the pin map is a button that drops a pin and shows where it is.
vi.mock("../../src/features/map/PinMap", () => ({
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

// jsdom has no canvas: the two encoded JPEGs are stand-ins.
vi.mock(import("../../src/features/jams/flyerCrop"), async (original) => ({
  ...(await original()),
  flyerImages: async () => ({
    flyer: new Blob(["flyer"], { type: "image/jpeg" }),
    card: new Blob(["card"], { type: "image/jpeg" }),
  }),
}));

/** jsdom decodes no images: every picked file opens as a `width`×`height` image. */
function pickedImagesAre(width: number, height: number) {
  URL.createObjectURL = () => "blob:flyer";
  URL.revokeObjectURL = () => undefined;
  Object.defineProperties(HTMLImageElement.prototype, {
    decode: { configurable: true, value: () => Promise.resolve() },
    naturalWidth: { configurable: true, get: () => width },
    naturalHeight: { configurable: true, get: () => height },
  });
}

const FLYER = "https://media.breakingjam.com/flyers/e001/f.jpg";
const CARD = "https://media.breakingjam.com/flyers/e001/f-card.jpg";
const png = () => new File(["png"], "flyer.png", { type: "image/png" });

/** The hidden file input the flyer pill opens, once the editor shows it. */
async function flyerInput() {
  await screen.findByRole("button", { name: /Upload a flyer/ });
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

const ME = { status: 200, body: { ...LIL_G, role: "organizer" } };
const at = "2030-01-01T10:00:00Z";
const ID = "01920000-0000-7000-8000-00000000e001";
const PUT = `PUT /api/events/${ID}`;

/** A two-day draft with a city but no pin yet, as write routes return it. */
const jam = (extra: object = {}) => ({
  id: ID,
  organizer_id: LIL_G.id,
  name: "Paris Cypher",
  slug: "paris-cypher-00e001",
  description: null,
  status: "draft",
  starts_on: "2030-06-01",
  ends_on: "2030-06-02",
  timezone: "Europe/Paris",
  opens_at: null,
  closes_at: null,
  venue_name: null,
  address: null,
  city: "Paris",
  country: "FR",
  lat: null,
  lng: null,
  review_note: null,
  created_at: at,
  updated_at: at,
  ...extra,
});

/** The same jam as `GET` returns it to its organiser. */
const page = (extra: object = {}) => ({
  ...jam(extra),
  can_edit: true,
  organizer: {
    id: LIL_G.id,
    display_name: "Lil G",
    instagram_handle: null,
    verified: false,
    jams: 0,
  },
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

/** A Photon result; the coordinates are `[lng, lat]`. */
const found = (properties: object, coordinates: [number, number]) => ({
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates }, properties },
  ],
});
const DYNAMO = found(
  {
    osm_type: "N",
    osm_id: 1,
    osm_key: "amenity",
    osm_value: "community_centre",
    name: "Dynamo Jugendkulturhaus",
    street: "Wasserwerkstrasse",
    housenumber: "21",
    postcode: "8006",
    city: "Zürich",
    country: "Switzerland",
    countrycode: "CH",
  },
  [8.5417, 47.3769],
);

/** The jam with everything the checklist asks for. */
const complete = () => ({
  [`GET /api/events/${ID}`]: {
    status: 200,
    body: page({ lat: 48.86, lng: 2.35 }),
  },
  [`GET /api/events/${ID}/battles`]: { status: 200, body: [battle()] },
});

/** The edit page's API: the jam, its battles and lineup, the organiser's page. */
function editApi(replies: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    "GET /api/auth/me": ME,
    [`GET /api/events/${ID}`]: { status: 200, body: page() },
    [`GET /api/events/${ID}/battles`]: { status: 200, body: [] },
    [`GET /api/events/${ID}/staff`]: { status: 200, body: [] },
    [`GET /api/events/${ID}/flyer.svg`]: {
      status: 200,
      text: "<svg></svg>",
      type: "image/svg+xml",
    },
    [`GET /api/organizers/${LIL_G.id}`]: {
      status: 200,
      body: {
        id: LIL_G.id,
        display_name: "Lil G",
        instagram_handle: null,
        country: null,
        city: null,
        bio: null,
        verified_at: null,
        can_edit: true,
        jams: 0,
      },
    },
    ...replies,
  });
}

/** Waits for the autosave, which goes out a moment after typing stops. */
const saved = (fetch: ReturnType<typeof mockApi>) =>
  waitFor(() => expect(calls(fetch)).toContain(PUT), { timeout: 3000 });

describe("the jam editor", () => {
  beforeEach(() => {
    freezeToday();
    // jsdom does not scroll; the checklist's "Add" scrolls to the block it opens.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows what the draft still needs, and holds Publish until it has it", async () => {
    editApi();
    renderApp(`/org/jams/${ID}/edit`);

    expect(
      await screen.findByRole("heading", { name: "Paris Cypher" }),
    ).toBeInTheDocument();
    const card = await screen.findByRole("region", {
      name: "Ready to publish?",
    });
    expect(within(card).getByText("2 of 4")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "2",
    );
    expect(
      within(card).getByRole("button", { name: "Publish · 2 left" }),
    ).toBeDisabled();
    // Visitors never see empty blocks; the organiser sees what to fill in.
    expect(screen.getByRole("region", { name: "Battles" })).toHaveTextContent(
      "Required",
    );
    // The venue has its city already, so it reads as filled; the pin is what is missing.
    expect(screen.getByRole("region", { name: "Venue" })).toHaveTextContent(
      "Paris, France",
    );
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      `/jams/${jam().slug}`,
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows another organiser's jam as not found", async () => {
    mockApi({
      "GET /api/auth/me": ME,
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: { ...page({ status: "published" }), can_edit: false },
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("shows why an admin sent the jam back", async () => {
    editApi({
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ review_note: "Add the venue address." }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    expect(
      await screen.findByText(
        "Sent back by BreakingJam: Add the venue address.",
      ),
    ).toBeInTheDocument();
  });

  it("fills in the venue from a suggestion, and saves as you go", async () => {
    const fetch = editApi({
      "GET /api/": { status: 200, body: DYNAMO },
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ city: null, country: null }),
      },
      [PUT]: { status: 200, body: jam() },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const venue = await screen.findByRole("region", { name: "Venue" });
    expect(venue).toHaveTextContent("City, address and the pin on the map");

    await userEvent.click(within(venue).getByRole("button", { name: "Add" }));
    const open = screen.getByRole("region", { name: "Venue" });
    // No city yet: the fields are there to type one, until the search fills them.
    expect(within(open).getByLabelText("City")).toHaveValue("");
    await userEvent.type(
      within(open).getByRole("combobox", { name: "Find the place" }),
      "Dynamo",
    );
    const option = await within(open).findByRole("option", {
      name: /Dynamo Jugendkulturhaus/,
    });
    expect(option).toHaveTextContent("Wasserwerkstrasse 21, 8006 Zürich");
    await userEvent.click(option);

    expect(within(open).getByLabelText(/^Venue/)).toHaveValue(
      "Dynamo Jugendkulturhaus",
    );
    expect(within(open).getByLabelText(/^Address/)).toHaveValue(
      "Wasserwerkstrasse 21, 8006 Zürich",
    );
    expect(
      within(open).getByRole("button", { name: "Pin at 47.3769,8.5417" }),
    ).toBeInTheDocument();
    // The city and country read off the address, with a way to correct them.
    expect(open).toHaveTextContent("Zürich, Switzerland");
    expect(open).toHaveTextContent("Filled from the address");
    expect(within(open).queryByLabelText("City")).toBeNull();
    expect(within(open).getByRole("combobox")).toHaveValue("");

    await saved(fetch);
    await waitFor(async () =>
      expect(await bodyOf(fetch, PUT)).toMatchObject({
        venue_name: "Dynamo Jugendkulturhaus",
        address: "Wasserwerkstrasse 21, 8006 Zürich",
        city: "Zürich",
        country: "CH",
        lat: 47.3769,
        lng: 8.5417,
      }),
    );
    // The place search calls `fetch` with a URL, the API client with a Request.
    const url = new URL(
      fetch.mock.calls
        .map(([input]) =>
          typeof input === "string" ? input : (input as Request).url,
        )
        .find((u) => u.includes("photon"))!,
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: "Dynamo",
      lang: "en",
    });

    await userEvent.click(within(open).getByRole("button", { name: "Edit" }));
    expect(within(open).getByLabelText("City")).toHaveValue("Zürich");
    expect(within(open).getByLabelText("Country")).toHaveValue("CH");

    await userEvent.click(within(open).getByRole("button", { name: "Done" }));
    const closed = screen.getByRole("region", { name: "Venue" });
    expect(closed).toHaveTextContent("Dynamo Jugendkulturhaus");
    expect(closed).toHaveTextContent("Zürich, Switzerland");
  });

  it("picks a suggestion with the arrow keys and Enter", async () => {
    editApi({ "GET /api/": { status: 200, body: DYNAMO } });
    renderApp(`/org/jams/${ID}/edit`);
    const venue = await screen.findByRole("region", { name: "Venue" });
    await userEvent.click(within(venue).getByRole("button", { name: "Edit" }));
    const open = screen.getByRole("region", { name: "Venue" });

    const field = within(open).getByRole("combobox", {
      name: "Find the place",
    });
    await userEvent.type(field, "Dynamo");
    await within(open).findByRole("option", { name: /Dynamo/ });
    await userEvent.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      within(open).getByRole("option", { name: /Dynamo/ }).id,
    );
    await userEvent.keyboard("{Enter}");
    expect(within(open).getByLabelText(/^Venue/)).toHaveValue(
      "Dynamo Jugendkulturhaus",
    );
    expect(within(open).queryByRole("listbox")).toBeNull();
  });

  it("names the city under a pin dropped before any search", async () => {
    const fetch = editApi({
      "GET /reverse": {
        status: 200,
        body: found(
          {
            osm_type: "W",
            osm_id: 2,
            osm_key: "building",
            osm_value: "yes",
            street: "Rue des Arts",
            housenumber: "12",
            city: "Paris",
            country: "France",
            countrycode: "FR",
          },
          [2.35, 48.86],
        ),
      },
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ city: null, country: null }),
      },
      [PUT]: { status: 200, body: jam() },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const venue = await screen.findByRole("region", { name: "Venue" });
    await userEvent.click(within(venue).getByRole("button", { name: "Add" }));
    const open = screen.getByRole("region", { name: "Venue" });
    expect(open).toHaveTextContent("Tap the map to drop the pin");

    await userEvent.click(
      await within(open).findByRole("button", { name: "Pin at nowhere" }),
    );
    expect(await within(open).findByText("Paris, France")).toBeInTheDocument();
    expect(open).toHaveTextContent("Drag the pin to the exact door");
    // The address under the pin is not the venue's: only the city and country are taken.
    expect(within(open).getByLabelText(/^Address/)).toHaveValue("");

    await saved(fetch);
    await waitFor(async () =>
      expect(await bodyOf(fetch, PUT)).toMatchObject({
        city: "Paris",
        country: "FR",
        lat: 48.86,
        lng: 2.35,
        address: null,
      }),
    );
  });

  it("keeps a city typed while the pin's lookup is still out", async () => {
    const fetch = editApi({
      "GET /reverse": {
        status: 200,
        body: found(
          {
            osm_type: "N",
            osm_id: 3,
            osm_key: "place",
            osm_value: "town",
            name: "Dübendorf",
            country: "Switzerland",
            countrycode: "CH",
          },
          [8.62, 47.4],
        ),
      },
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ city: null, country: null }),
      },
      [PUT]: { status: 200, body: jam() },
    });
    // Photon takes its time; the organiser types meanwhile.
    vi.stubGlobal("fetch", async (input: Request | string) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/reverse"))
        await new Promise((r) => setTimeout(r, 400));
      return fetch(input);
    });
    renderApp(`/org/jams/${ID}/edit`);
    const venue = await screen.findByRole("region", { name: "Venue" });
    await userEvent.click(within(venue).getByRole("button", { name: "Add" }));
    const open = screen.getByRole("region", { name: "Venue" });

    await userEvent.click(
      await within(open).findByRole("button", { name: "Pin at nowhere" }),
    );
    await userEvent.type(within(open).getByLabelText("City"), "Zürich");
    // The lookup lands: it fills only what is still blank, and never takes the field away.
    await waitFor(
      () => expect(within(open).getByLabelText("Country")).toHaveValue("CH"),
      { timeout: 2000 },
    );
    expect(within(open).getByLabelText("City")).toHaveValue("Zürich");
    expect(within(open).getByLabelText("City")).toHaveFocus();
    await saved(fetch);
    await waitFor(async () =>
      expect(await bodyOf(fetch, PUT)).toMatchObject({
        city: "Zürich",
        country: "CH",
        lat: 48.86,
        lng: 2.35,
      }),
    );
  });

  it("says when no place matches", async () => {
    editApi({
      "GET /api/": {
        status: 200,
        body: { type: "FeatureCollection", features: [] },
      },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const venue = await screen.findByRole("region", { name: "Venue" });
    await userEvent.click(within(venue).getByRole("button", { name: "Edit" }));
    await userEvent.type(
      screen.getByRole("combobox", { name: "Find the place" }),
      "Zzzzz",
    );
    expect(await screen.findByText(/No place found/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens the block a missing checklist item points to", async () => {
    editApi();
    renderApp(`/org/jams/${ID}/edit`);
    const card = await screen.findByRole("region", {
      name: "Ready to publish?",
    });

    await userEvent.click(
      within(card).getByRole("button", { name: "Add: City and map pin" }),
    );
    const venue = screen.getByRole("region", { name: "Venue" });
    expect(
      within(venue).getByRole("combobox", { name: "Find the place" }),
    ).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("opens the checklist as a sheet from the bar on phones", async () => {
    editApi();
    renderApp(`/org/jams/${ID}/edit`);
    await screen.findByRole("region", { name: "Ready to publish?" });

    // The bar's button is the enabled one: it opens the list rather than publishing.
    const bar = screen
      .getAllByRole("button", { name: "Publish · 2 left" })
      .find((button) => !(button as HTMLButtonElement).disabled)!;
    await userEvent.click(bar);
    const sheet = screen.getByRole("dialog", { name: "Almost there" });
    expect(sheet).toHaveTextContent(
      "2 things left before your jam goes on the map.",
    );
    expect(
      within(sheet).getByRole("button", { name: "Publish" }),
    ).toBeDisabled();

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Add: City and map pin" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      within(screen.getByRole("region", { name: "Venue" })).getByRole(
        "combobox",
        { name: "Find the place" },
      ),
    ).toBeInTheDocument();
  });

  it("saves a block as you type, a moment after typing stops", async () => {
    const user = userEvent.setup();
    const fetch = editApi({
      [PUT]: { status: 200, body: jam({ description: "Cyphers all day." }) },
    });
    renderApp(`/org/jams/${ID}/edit`);

    const about = await screen.findByRole("region", { name: "About" });
    await user.click(within(about).getByRole("button", { name: "Add" }));
    await user.type(
      screen.getByRole("textbox", { name: "About" }),
      "Cyphers all day.",
    );
    expect(calls(fetch)).not.toContain(PUT);

    await saved(fetch);
    expect(await bodyOf(fetch, PUT)).toMatchObject({
      name: "Paris Cypher",
      description: "Cyphers all day.",
      city: "Paris",
    });
    // One request for the whole sentence, not one per letter.
    expect(calls(fetch).filter((c) => c === PUT)).toHaveLength(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    const closed = screen.getByRole("region", { name: "About" });
    expect(closed).toHaveTextContent("Cyphers all day.");
    expect(
      within(closed).getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
  });

  it("sets the last day and the hours from the date chips", async () => {
    const user = userEvent.setup();
    const fetch = editApi({
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ ends_on: "2030-06-01" }),
      },
      [PUT]: {
        status: 200,
        body: jam({ opens_at: "14:00:00", closes_at: "21:30:00" }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    await user.click(await screen.findByRole("button", { name: "Last day" }));
    const dates = screen.getByRole("region", { name: "Dates" });
    await user.type(within(dates).getByLabelText(/^Last day/), "2030-06-02");
    await user.type(within(dates).getByLabelText(/^Opens/), "14:00");
    await user.type(within(dates).getByLabelText(/^Ends/), "21:30");

    await saved(fetch);
    await waitFor(async () =>
      expect(await bodyOf(fetch, PUT)).toMatchObject({
        starts_on: "2030-06-01",
        ends_on: "2030-06-02",
        opens_at: "14:00",
        closes_at: "21:30",
      }),
    );
    await user.click(within(dates).getByRole("button", { name: "Done" }));
    // The chips now carry the range and the hours; "+ Last day" is gone.
    expect(
      screen.getByRole("button", { name: /Sat,? 1.+Sun,? 2 Jun/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "14:00–21:30" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last day" })).toBeNull();
  });

  it("never sends a blank name, and keeps the field until there is one", async () => {
    const user = userEvent.setup();
    const fetch = editApi();
    renderApp(`/org/jams/${ID}/edit`);

    await user.click(
      await screen.findByRole("button", { name: "Edit the name" }),
    );
    await user.clear(screen.getByRole("textbox", { name: "Jam name" }));
    await user.tab();
    expect(await screen.findByText("Required.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Jam name" })).toHaveValue("");
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(calls(fetch)).not.toContain(PUT);
  });

  it("keeps a block open on what the server refused, and leads back to it", async () => {
    const user = userEvent.setup();
    const message = "a battle starts after this day; move the battle first";
    const fetch = editApi({
      [PUT]: {
        status: 422,
        body: {
          error: {
            code: "validation",
            message: "validation failed",
            fields: [{ field: "ends_on", message }],
          },
        },
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    await user.click(await screen.findByRole("button", { name: /Sat,? 1/ }));
    const dates = screen.getByRole("region", { name: "Dates" });
    await user.clear(within(dates).getByLabelText(/^Last day/));
    await user.click(within(dates).getByRole("button", { name: "Done" }));
    await saved(fetch);

    // Done came before the answer: the block comes back, with the reason in it.
    const reopened = await screen.findByRole("region", { name: "Dates" });
    expect(await within(reopened).findByText(message)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Not saved.*Fix/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("holds back a link the API would refuse, and saves the rest", async () => {
    const user = userEvent.setup();
    const fetch = editApi({ [PUT]: { status: 200, body: jam() } });
    renderApp(`/org/jams/${ID}/edit`);
    const puts = () => calls(fetch).filter((c) => c === PUT);

    const links = await screen.findByRole("region", { name: "Links" });
    await user.click(within(links).getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText(/^Website/), "www.myjam.com");
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(
      await screen.findByText("Use a link starting with https://"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Website/)).toHaveValue("www.myjam.com");
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(puts()).toHaveLength(0);

    // Other edits still go out, with the link left at what is stored.
    const about = screen.getByRole("region", { name: "About" });
    await user.click(within(about).getByRole("button", { name: "Add" }));
    await user.type(
      screen.getByRole("textbox", { name: "About" }),
      "Cyphers all day.",
    );
    await saved(fetch);
    await waitFor(async () =>
      expect(await bodyOf(fetch, PUT)).toMatchObject({
        description: "Cyphers all day.",
        website_url: null,
      }),
    );
    expect(await screen.findByText("Not saved")).toBeInTheDocument();

    const website = screen.getByLabelText(/^Website/);
    await user.clear(website);
    await user.type(website, "https://www.myjam.com");
    await waitFor(
      async () =>
        expect(await bodyOf(fetch, PUT)).toMatchObject({
          description: "Cyphers all day.",
          website_url: "https://www.myjam.com",
        }),
      { timeout: 3000 },
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("offers to try again when a save fails for no fault of a field", async () => {
    const user = userEvent.setup();
    const fetch = editApi({
      [PUT]: (n) =>
        n === 0
          ? {
              status: 500,
              body: { error: { code: "internal", message: "internal error" } },
            }
          : { status: 200, body: jam({ description: "Cyphers." }) },
    });
    renderApp(`/org/jams/${ID}/edit`);

    const about = await screen.findByRole("region", { name: "About" });
    await user.click(within(about).getByRole("button", { name: "Add" }));
    await user.type(screen.getByRole("textbox", { name: "About" }), "Cyphers.");
    await user.click(
      await screen.findByRole("button", { name: /Not saved.*Retry/ }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(calls(fetch).filter((c) => c === PUT)).toHaveLength(2);
  });

  it("sends what is waiting when you leave, and says so when it can't", async () => {
    const user = userEvent.setup();
    const fetch = editApi({
      "GET /api/events": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      [PUT]: {
        status: 500,
        body: { error: { code: "internal", message: "internal error" } },
      },
    });
    const router = renderApp(`/org/jams/${ID}/edit`);

    const about = await screen.findByRole("region", { name: "About" });
    await user.click(within(about).getByRole("button", { name: "Add" }));
    await user.type(screen.getByRole("textbox", { name: "About" }), "Cyphers.");
    await router.navigate("/org/jams");

    expect(
      await screen.findByText("Your last changes weren’t saved."),
    ).toBeInTheDocument();
    expect(calls(fetch)).toContain(PUT);
  });

  it("shows Saving from the first letter, and asks before the tab closes on it", async () => {
    const user = userEvent.setup();
    const fetch = editApi({ [PUT]: { status: 200, body: jam() } });
    const closing = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    renderApp(`/org/jams/${ID}/edit`);

    const about = await screen.findByRole("region", { name: "About" });
    expect(closing()).toBe(false);
    await user.click(within(about).getByRole("button", { name: "Add" }));
    await user.type(screen.getByRole("textbox", { name: "About" }), "Cyphers.");
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(closing()).toBe(true);

    await saved(fetch);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(closing()).toBe(false);
  });

  it("keeps a live jam's city: a blank one is held back", async () => {
    const user = userEvent.setup();
    const fetch = editApi({
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ status: "published", lat: 48.86, lng: 2.35 }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    const venue = await screen.findByRole("region", { name: "Venue" });
    await user.click(within(venue).getByRole("button", { name: "Edit" }));
    const open = screen.getByRole("region", { name: "Venue" });
    await user.click(within(open).getByRole("button", { name: "Edit" }));
    await user.clear(within(open).getByLabelText("City"));

    expect(await within(open).findByText("Required.")).toBeInTheDocument();
    expect(calls(fetch)).not.toContain(PUT);
  });

  it("keeps the city field while you type, with the country already chosen", async () => {
    editApi({
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ city: null, country: "FR" }),
      },
      [PUT]: { status: 200, body: jam() },
    });
    renderApp(`/org/jams/${ID}/edit`);

    const venue = await screen.findByRole("region", { name: "Venue" });
    await userEvent.click(within(venue).getByRole("button", { name: "Edit" }));
    const open = screen.getByRole("region", { name: "Venue" });
    const city = within(open).getByLabelText("City");
    await userEvent.type(city, "Paris");

    expect(within(open).getByLabelText("City")).toHaveValue("Paris");
    expect(city).toHaveFocus();
  });

  it("replaces what the last pick filled in, never what was typed", async () => {
    const street = found(
      {
        osm_type: "W",
        osm_id: 2,
        osm_key: "highway",
        osm_value: "residential",
        name: "Rue des Arts",
        postcode: "75003",
        city: "Paris",
        country: "France",
        countrycode: "FR",
      },
      [2.35, 48.86],
    );
    editApi({
      "GET /api/": {
        status: 200,
        body: {
          type: "FeatureCollection",
          features: [...DYNAMO.features, ...street.features],
        },
      },
      [PUT]: { status: 200, body: jam() },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const venue = await screen.findByRole("region", { name: "Venue" });
    await userEvent.click(within(venue).getByRole("button", { name: "Edit" }));
    const open = screen.getByRole("region", { name: "Venue" });
    const choose = async (name: RegExp) => {
      await userEvent.type(within(open).getByRole("combobox"), "Dynamo");
      await userEvent.click(await within(open).findByRole("option", { name }));
    };

    await choose(/Dynamo Jugendkulturhaus/);
    await choose(/Rue des Arts/);
    // A street has no venue: Dynamo's name must not stay on the new address.
    expect(within(open).getByLabelText(/^Venue/)).toHaveValue("");
    expect(within(open).getByLabelText(/^Address/)).toHaveValue(
      "Rue des Arts, 75003 Paris",
    );

    await userEvent.type(within(open).getByLabelText(/^Venue/), "Le Hangar");
    await choose(/Rue des Arts/);
    expect(within(open).getByLabelText(/^Venue/)).toHaveValue("Le Hangar");
  });

  it("deletes a draft at every width", async () => {
    const fetch = editApi({
      "GET /api/events": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      [`DELETE /api/events/${ID}`]: { status: 204 },
    });
    const router = renderApp(`/org/jams/${ID}/edit`);

    const card = await screen.findByRole("region", {
      name: "Ready to publish?",
    });
    // The checklist card is hidden on phones, so the button can't live in it.
    expect(
      within(card).queryByRole("button", { name: "Delete jam" }),
    ).toBeNull();
    const remove = screen.getByRole("button", { name: "Delete jam" });
    expect(remove.closest(".hidden")).toBeNull();

    await userEvent.click(remove);
    const dialog = screen.getByRole("dialog", { name: "Delete this jam?" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete jam" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/org/jams"),
    );
    expect(calls(fetch)).toContain(`DELETE /api/events/${ID}`);
  });

  it("never mixes up two jams it moves between", async () => {
    const OTHER = "01920000-0000-7000-8000-00000000e002";
    const zurich = { name: "Zurich Jam", slug: "zurich-jam-00e002" };
    const fetch = editApi({
      [`GET /api/events/${OTHER}`]: {
        status: 200,
        body: { ...page(zurich), id: OTHER },
      },
      [`GET /api/events/${OTHER}/battles`]: { status: 200, body: [] },
      [`GET /api/events/${OTHER}/staff`]: { status: 200, body: [] },
      [`GET /api/events/${OTHER}/flyer.svg`]: {
        status: 200,
        text: "<svg></svg>",
        type: "image/svg+xml",
      },
      [`PUT /api/events/${OTHER}`]: {
        status: 200,
        body: { ...jam(zurich), id: OTHER },
      },
    });
    const router = renderApp(`/org/jams/${ID}/edit`);
    const heading = (name: string) => screen.findByRole("heading", { name });

    await heading("Paris Cypher");
    await router.navigate(`/org/jams/${OTHER}/edit`);
    await heading("Zurich Jam");
    // Both are cached now: the page swaps without a loading screen between them.
    await router.navigate(`/org/jams/${ID}/edit`);
    await heading("Paris Cypher");
    await router.navigate(`/org/jams/${OTHER}/edit`);
    await heading("Zurich Jam");

    const about = screen.getByRole("region", { name: "About" });
    await userEvent.click(within(about).getByRole("button", { name: "Add" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "About" }),
      "Zurich only.",
    );
    await waitFor(
      () => expect(calls(fetch)).toContain(`PUT /api/events/${OTHER}`),
      { timeout: 3000 },
    );
    expect(await bodyOf(fetch, `PUT /api/events/${OTHER}`)).toMatchObject({
      name: "Zurich Jam",
      description: "Zurich only.",
    });
    expect(calls(fetch)).not.toContain(PUT);
  });

  it("publishes once the checklist is complete, and saves the name in place", async () => {
    const fetch = editApi({
      ...complete(),
      [`POST /api/events/${ID}/submit`]: {
        status: 200,
        body: jam({ status: "in_review" }),
      },
      [PUT]: { status: 200, body: jam({ name: "Paris Cypher Vol. 2" }) },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const card = await screen.findByRole("region", {
      name: "Ready to publish?",
    });
    expect(within(card).getByText("4 of 4")).toBeInTheDocument();
    // Organisers don't publish directly: a BreakingJam admin reviews each jam first.
    expect(card).toHaveTextContent(/A BreakingJam admin checks it/);

    await userEvent.click(
      within(card).getByRole("button", { name: "Publish" }),
    );
    expect(
      await screen.findByText(
        "Submitted. A BreakingJam admin will review it soon.",
      ),
    ).toBeInTheDocument();
    expect(calls(fetch)).toContain(`POST /api/events/${ID}/submit`);
    const status = await screen.findByRole("region", { name: /Status/ });
    expect(status).toHaveTextContent("In review");
    expect(
      within(status).queryByRole("button", { name: /Publish/ }),
    ).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Edit the name" }),
    );
    const name = screen.getByRole("textbox", { name: "Jam name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Paris Cypher Vol. 2");
    await saved(fetch);
    expect(await bodyOf(fetch, PUT)).toMatchObject({
      name: "Paris Cypher Vol. 2",
      timezone: "Europe/Paris",
    });
  });

  it("lets the BreakingJam team publish without review", async () => {
    const fetch = editApi({
      ...complete(),
      "GET /api/auth/me": {
        status: 200,
        body: { ...LIL_G, role: "seed_admin" },
      },
      [`POST /api/events/${ID}/publish`]: {
        status: 200,
        body: jam({ status: "published" }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);
    const card = await screen.findByRole("region", {
      name: "Ready to publish?",
    });
    expect(card).toHaveTextContent(/As the BreakingJam team, you publish it/);

    await userEvent.click(
      within(card).getByRole("button", { name: "Publish" }),
    );
    expect(
      await screen.findByText("Published. It’s on the map."),
    ).toBeInTheDocument();
    expect(calls(fetch)).toContain(`POST /api/events/${ID}/publish`);
  });

  it("keeps a live jam editable, with its status card instead of the checklist", async () => {
    const fetch = editApi({
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ status: "published", lat: 48.86, lng: 2.35 }),
      },
      [`GET /api/events/${ID}/battles`]: { status: 200, body: [battle()] },
      [PUT]: {
        status: 200,
        body: jam({ status: "published", name: "Paris Cypher Vol. 2" }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    const status = await screen.findByRole("region", { name: /Status/ });
    expect(
      within(status).getByRole("button", { name: "Close registration" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Ready to publish?" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();

    // Edits to a live jam go public as soon as they save.
    await userEvent.click(
      screen.getByRole("button", { name: "Edit the name" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Jam name" }),
      " Vol. 2",
    );
    await saved(fetch);
    expect(await bodyOf(fetch, PUT)).toMatchObject({
      name: "Paris Cypher Vol. 2",
    });
  });

  it("adds a battle named from its fields", async () => {
    const fetch = editApi({
      [`GET /api/events/${ID}/battles`]: (n) => ({
        status: 200,
        body:
          n === 0
            ? []
            : [
                battle({
                  name: "2v2 Mixed Kids",
                  prize_currency: "EUR",
                  prize_first: 500,
                }),
              ],
      }),
      [`POST /api/events/${ID}/battles`]: { status: 201, body: battle() },
    });
    renderApp(`/org/jams/${ID}/edit`);

    const battles = await screen.findByRole("region", { name: "Battles" });
    await userEvent.click(within(battles).getByRole("button", { name: "Add" }));
    const dialog = screen.getByRole("dialog", { name: "Add a battle" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Size"), "2");
    await userEvent.selectOptions(within(dialog).getByLabelText("Age"), "kids");
    expect(within(dialog).getByLabelText(/^Name/)).toHaveAttribute(
      "placeholder",
      "2v2 Mixed Kids",
    );
    // Prize amounts appear once a currency is chosen.
    expect(within(dialog).queryByLabelText(/^1st place/)).toBeNull();
    await userEvent.selectOptions(
      within(dialog).getByLabelText(/^Cash prize/),
      "EUR",
    );
    await userEvent.type(within(dialog).getByLabelText(/^1st place/), "500");
    // The jam runs two days: the start takes a day and a time.
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Day"),
      "2030-06-02",
    );
    await userEvent.type(within(dialog).getByLabelText(/^Start time/), "14:30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("heading", { name: "2v2 Mixed Kids" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1st €500$/)).toBeInTheDocument();
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
      prize_currency: "EUR",
      prize_first: 500,
      prize_second: null,
      prize_third: null,
      starts_at: "2030-06-02T14:30:00",
    });
  });

  it("opens the lineup to add judges, DJs and MCs", async () => {
    editApi();
    renderApp(`/org/jams/${ID}/edit`);

    const lineup = await screen.findByRole("region", { name: "Lineup" });
    expect(lineup).toHaveTextContent("Judges, DJs and MCs");
    await userEvent.click(within(lineup).getByRole("button", { name: "Add" }));
    const open = screen.getByRole("region", { name: "Lineup" });
    for (const role of ["Add a judge", "Add a DJ", "Add an MC"]) {
      expect(
        within(open).getByRole("button", { name: role }),
      ).toBeInTheDocument();
    }
  });

  it("shows the account as organiser, with Change opening its page", async () => {
    editApi();
    renderApp(`/org/jams/${ID}/edit`);

    const organiser = await screen.findByRole("region", { name: "Organiser" });
    expect(organiser).toHaveTextContent("Lil G");
    expect(organiser).toHaveTextContent("Your account");
    await userEvent.click(
      await within(organiser).findByRole("button", { name: "Change" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit page" });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Lil G");
  });

  it("refuses a file that isn't a PNG or JPEG, and a tiny image", async () => {
    editApi();
    renderApp(`/org/jams/${ID}/edit`);
    // The picker filters by type; a drop or another picker may not.
    const user = userEvent.setup({ applyAccept: false });
    const field = await flyerInput();

    const gif = new File(["GIF89a"], "flyer.gif", { type: "image/gif" });
    await user.upload(field, gif);
    expect(
      await screen.findByText("That file isn’t a PNG or JPEG."),
    ).toBeInTheDocument();

    pickedImagesAre(500, 600);
    await user.upload(field, png());
    expect(
      await screen.findByText(
        "That image is too small: it needs at least 540 × 675 px.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("crops a picked image and uploads it in both sizes", async () => {
    pickedImagesAre(3000, 2000);
    const fetch = editApi({
      [`POST /api/events/${ID}/flyer`]: {
        status: 200,
        body: jam({ flyer_url: FLYER, flyer_card_url: CARD }),
      },
    });
    const appended = vi.spyOn(FormData.prototype, "append");
    renderApp(`/org/jams/${ID}/edit`);
    const user = userEvent.setup();
    expect(await screen.findByText("Generated")).toBeInTheDocument();
    await user.upload(await flyerInput(), png());

    const dialog = await screen.findByRole("dialog", {
      name: "Crop your flyer",
    });
    // 3000 × 2000 shows 1600 px across at first: sharp, so no warning yet.
    expect(within(dialog).queryByText(/will look soft/)).toBeNull();
    // Four steps of 0.25 halve it to 800 px: soft on the jam page.
    const zoom = within(dialog).getByRole("button", { name: "Zoom in" });
    for (let step = 0; step < 4; step++) await user.click(zoom);
    expect(within(dialog).getByText(/This crop is 800 px wide/)).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Use this flyer" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const upload = fetch.mock.calls
      .map(([input]) => input as Request)
      .find((r) => r.method === "POST" && r.url.endsWith("/flyer"));
    expect(upload!.headers.get("content-type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    // The parts as added: jsdom's blobs can't be read back through Node's fetch.
    expect(appended.mock.calls).toEqual([
      ["flyer", expect.any(Blob), "flyer.jpg"],
      ["card", expect.any(Blob), "card.jpg"],
    ]);
    expect(
      await screen.findByRole("img", { name: "Flyer of Paris Cypher" }),
    ).toHaveAttribute("src", FLYER);
    expect(screen.getByText("Flyer updated.")).toBeInTheDocument();
    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    appended.mockRestore();
  });

  it("removes the uploaded flyer to go back to the generated one", async () => {
    const fetch = editApi({
      [`GET /api/events/${ID}`]: {
        status: 200,
        body: page({ flyer_url: FLYER, flyer_card_url: CARD }),
      },
      [`DELETE /api/events/${ID}/flyer`]: {
        status: 200,
        body: jam({ flyer_url: null, flyer_card_url: null }),
      },
    });
    renderApp(`/org/jams/${ID}/edit`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove flyer" }),
    );
    expect(
      await screen.findByRole("button", { name: /Upload a flyer/ }),
    ).toBeInTheDocument();
    expect(calls(fetch)).toContain(`DELETE /api/events/${ID}/flyer`);
    expect(
      screen.getByText("Flyer removed: the generated one is back."),
    ).toBeInTheDocument();
  });
});
