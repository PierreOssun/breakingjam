import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import type { JamMap } from "../../src/features/map/JamMap";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";
import { freezeToday, geojson, jamFeature } from "../support/jams";

// jsdom has no WebGL: the map is a list of marker buttons that drives the same callbacks.
vi.mock("../../src/features/map/JamMap", () => ({
  JamMap: (props: ComponentProps<typeof JamMap>) => (
    <div data-testid="map" data-camera={JSON.stringify(props.camera)}>
      {props.jams.map((jam) => (
        <button
          key={jam.id}
          type="button"
          onClick={(e) => props.onSelect(jam, e.currentTarget)}
        >
          Marker {jam.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => props.onBoundsChange([0, 45, 10, 50])}
      >
        Pan to Zurich and Paris
      </button>
      {props.popup}
    </div>
  ),
}));

const GEOJSON = geojson(
  jamFeature(1, "Berlin Breaks", {
    country: "DE",
    coordinates: [13.4, 52.52],
    day: "2030-07-20",
    battles: ["2v2 Mixed"],
    categories: ["two_v_two"],
  }),
  jamFeature(2, "Concrete Cypher", {
    city: "Zurich",
    coordinates: [8.54, 47.37],
    day: "2030-06-08",
    battles: ["1v1 Bboy", "1v1 Bgirl"],
    categories: ["one_v_one", "bgirl"],
  }),
  jamFeature(3, "Kids Jam Paris", {
    city: "Paris",
    country: "FR",
    coordinates: [2.35, 48.86],
    day: "2030-06-15",
    until: "2030-06-16",
    status: "registration_closed",
    battles: ["3v3 Crew", "1v1 Kids"],
    categories: ["crew", "kids"],
  }),
);

function api() {
  return mockApi({
    "GET /api/auth/me": LOGGED_OUT,
    "GET /api/events.geojson": GEOJSON,
  });
}

/** ≥ lg: the side panel and the anchored popup. */
function desktop() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 1024px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** The names of the jam rows shown, in order. */
async function rows() {
  await screen.findByText(/\d+ jams? (in this area|around)/);
  return screen
    .queryAllByRole("article")
    .map((row) => within(row).getByRole("heading").textContent?.split(",")[0]);
}

const count = () => screen.getByRole("status").textContent;

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("MapPage", () => {
  beforeEach(() => freezeToday());

  it("lists the jams in view, soonest first, and counts them", async () => {
    desktop();
    api();
    renderApp("/map");

    expect(await rows()).toEqual([
      "Concrete Cypher",
      "Kids Jam Paris",
      "Berlin Breaks",
    ]);
    expect(count()).toBe("3 jams in this area · Now – 1 Jan 2031");
    // The first view frames every jam, without animation.
    expect(
      JSON.parse(screen.getByTestId("map").dataset.camera ?? "null"),
    ).toEqual({
      kind: "fit",
      bounds: [2.35, 47.37, 13.4, 52.52],
      maxZoom: 10,
      animate: false,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Pan to Zurich and Paris" }),
    );
    expect(await rows()).toEqual(["Concrete Cypher", "Kids Jam Paris"]);
    expect(count()).toBe("2 jams in this area · Now – 1 Jan 2031");
  });

  it("starts on the visitor's country", async () => {
    desktop();
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": GEOJSON,
      "GET /api/geo": { status: 200, body: { country: "CH" } },
    });
    renderApp("/map");

    await rows();
    expect(
      JSON.parse(screen.getByTestId("map").dataset.camera ?? "null"),
    ).toEqual({
      kind: "fit",
      bounds: [5.9, 45.8, 10.5, 47.8],
      maxZoom: 10,
      animate: false,
    });
  });

  it("filters by battle category and by time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2030, 5, 5, 12)); // Wednesday 5 June 2030
    desktop();
    api();
    renderApp("/map");
    await rows();

    const kids = screen.getByRole("button", { name: "Kids" });
    await userEvent.click(kids);
    expect(kids).toHaveAttribute("aria-pressed", "true");
    expect(await rows()).toEqual(["Kids Jam Paris"]);

    // Any one category is enough.
    await userEvent.click(screen.getByRole("button", { name: "2v2" }));
    expect(await rows()).toEqual(["Kids Jam Paris", "Berlin Breaks"]);

    await userEvent.click(kids);
    await userEvent.click(screen.getByRole("button", { name: "2v2" }));
    // This weekend sets the dates to Saturday and Sunday; no preset is on then.
    const weekend = screen.getByRole("button", { name: "This weekend" });
    await userEvent.click(weekend);
    expect(await rows()).toEqual(["Concrete Cypher"]);
    expect(count()).toBe("1 jam in this area · 8 Jun – 9 Jun");
    expect(screen.getByRole("button", { name: "From: 8 Jun" })).toBeVisible();
    expect(screen.queryAllByRole("button", { pressed: true })).toEqual([
      weekend,
    ]);
    // "Next 30 days" is the date range's job on the map.
    expect(screen.queryByRole("button", { name: "Next 30 days" })).toBeNull();

    // A preset replaces the weekend.
    await userEvent.click(screen.getByRole("button", { name: "6 months" }));
    expect(weekend).toHaveAttribute("aria-pressed", "false");
    expect(await rows()).toEqual([
      "Concrete Cypher",
      "Kids Jam Paris",
      "Berlin Breaks",
    ]);
  });

  it("shows past jams on demand, most recent first, and finds them by search", async () => {
    // The server tells which jams are over; here all but Berlin Breaks.
    const ended = GEOJSON.body.features.map((jam) =>
      jam.properties.name === "Berlin Breaks"
        ? jam
        : { ...jam, properties: { ...jam.properties, phase: "past" as const } },
    );
    desktop();
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(...ended),
    });
    renderApp("/map");

    expect(await rows()).toEqual(["Berlin Breaks"]);
    await userEvent.click(screen.getByRole("button", { name: "3 months" }));

    // The dates can't reach the past: their card goes while past jams show.
    const past = screen.getByRole("button", { name: "Past jams" });
    await userEvent.click(past);
    expect(past).toHaveAttribute("aria-pressed", "true");
    expect(await rows()).toEqual(["Kids Jam Paris", "Concrete Cypher"]);
    expect(count()).toBe("2 jams in this area");
    expect(screen.queryByRole("slider")).toBeNull();

    // Off again: the card comes back with its dates.
    await userEvent.click(past);
    expect(
      screen.getByRole("button", { name: "3 months", pressed: true }),
    ).toBeInTheDocument();

    // A search follows the dates, so it finds past jams only with the chip.
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search jams" }),
      "cypher{Enter}",
    );
    expect(await rows()).toEqual([]);
    expect(count()).toBe("0 jams around cypher · Now – 1 Apr");
    await userEvent.click(past);
    expect(await rows()).toEqual(["Concrete Cypher"]);
  });

  it("searches by name, city or country and frames the matches", async () => {
    desktop();
    api();
    renderApp("/map");
    await rows();
    const field = screen.getByRole("searchbox", { name: "Search jams" });

    await userEvent.type(field, "germany{Enter}");
    expect(await rows()).toEqual(["Berlin Breaks"]);
    expect(
      JSON.parse(screen.getByTestId("map").dataset.camera ?? "null"),
    ).toEqual({
      kind: "fit",
      bounds: [13.4, 52.52, 13.4, 52.52],
      maxZoom: 13,
      animate: true,
    });
    // A single match is the jam they were after: its popup opens.
    expect(
      screen.getByRole("dialog", { name: "Berlin Breaks" }),
    ).toBeInTheDocument();

    // Emptying the field brings every jam back; the open jam stays open.
    await userEvent.clear(field);
    expect(await rows()).toHaveLength(3);

    await userEvent.type(field, "zürich{Enter}");
    expect(await rows()).toEqual(["Concrete Cypher"]);
  });

  it("takes the landing page's search from ?q= and frames its matches", async () => {
    desktop();
    api();
    renderApp("/map?q=zurich");

    expect(await rows()).toEqual(["Concrete Cypher"]);
    expect(screen.getByRole("searchbox", { name: "Search jams" })).toHaveValue(
      "zurich",
    );
    expect(
      JSON.parse(screen.getByTestId("map").dataset.camera ?? "null"),
    ).toEqual({
      kind: "fit",
      bounds: [8.54, 47.37, 8.54, 47.37],
      maxZoom: 10,
      animate: false,
    });
  });

  it("frames the visitor's country when the ?q= search matches nothing", async () => {
    desktop();
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": GEOJSON,
      "GET /api/geo": { status: 200, body: { country: "CH" } },
    });
    renderApp("/map?q=nowhere");

    await screen.findByRole("heading", { name: "No jams here yet" });
    expect(
      JSON.parse(screen.getByTestId("map").dataset.camera ?? "null"),
    ).toEqual({
      kind: "fit",
      bounds: [5.9, 45.8, 10.5, 47.8],
      maxZoom: 10,
      animate: false,
    });
  });

  it("says when nothing is in view and clears filters and search", async () => {
    desktop();
    api();
    renderApp("/map");
    await rows();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search jams" }),
      "nowhere{Enter}",
    );
    expect(
      await screen.findByRole("heading", { name: "No jams here yet" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("complementary")).getByRole("link", {
        name: "Register a jam",
      }),
    ).toHaveAttribute("href", "/org/jams/new");

    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(await rows()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: "Search jams" })).toHaveValue(
      "",
    );
  });

  it("opens a jam's popup from its row; Esc closes it and focus goes back", async () => {
    desktop();
    api();
    renderApp("/map");
    await rows();

    const row = screen.getByRole("button", { name: /^Concrete Cypher ?, / });
    await userEvent.click(row);

    const popup = screen.getByRole("dialog", { name: "Concrete Cypher" });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(popup).getByRole("heading")).toHaveFocus();
    expect(within(popup).getByText("1v1 Bboy · 1v1 Bgirl")).toBeInTheDocument();
    // "Published" tells a visitor nothing (§4.3).
    expect(within(popup).queryByText("Published")).toBeNull();
    expect(
      within(popup).getByRole("link", { name: "View jam" }),
    ).toHaveAttribute("href", "/jams/concrete-cypher-2");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("shows the selected jam in a sheet on phones, with its distance", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { longitude: 8.5402, latitude: 47.3782 },
          } as GeolocationPosition),
      },
    });
    api();
    renderApp("/map");
    await screen.findByRole("button", { name: "Marker Concrete Cypher" });

    await userEvent.click(
      screen.getByRole("button", { name: "Show my location" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Marker Concrete Cypher" }),
    );

    const sheet = screen.getByRole("dialog", { name: "Concrete Cypher" });
    expect(within(sheet).getByText(/Zurich · 0\.9\s?km/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Share" })).toBeVisible();
    expect(
      within(sheet).getByRole("link", { name: "View jam" }),
    ).toHaveAttribute("href", "/jams/concrete-cypher-2");

    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marker Concrete Cypher" }),
    ).toHaveFocus();
  });

  it("reaches every jam without the map, through the list", async () => {
    api();
    renderApp("/map");
    await screen.findByRole("button", { name: "Marker Concrete Cypher" });

    await userEvent.click(screen.getByRole("button", { name: "List · 3" }));
    expect(count()).toBe("3 jams in this area · Now – 1 Jan 2031");
    expect(
      screen.getByRole("link", { name: /^Kids Jam Paris ?, / }),
    ).toHaveAttribute("href", "/jams/kids-jam-paris-3");

    await userEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(
      screen.queryByRole("link", { name: /^Kids Jam Paris ?, / }),
    ).toBeNull();
  });

  it("groups the filters in a sheet on phones", async () => {
    api();
    renderApp("/map");
    await screen.findByRole("button", { name: "Marker Concrete Cypher" });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Kids" }));
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Show 1 jam" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filters, 1 on" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Marker / })).toHaveLength(1);
  });

  it("says when the location is unavailable", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_: PositionCallback, fail: () => void) => fail(),
      },
    });
    api();
    renderApp("/map");
    await screen.findByRole("button", { name: "Marker Concrete Cypher" });

    await userEvent.click(
      screen.getByRole("button", { name: "Show my location" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t get your location.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when the jams do not load", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": { status: 500, body: {} },
    });
    renderApp("/map");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The jams didn’t load.",
    );
  });
});

describe("MapPage dates", () => {
  beforeEach(() => freezeToday());

  /** The track the handles move on, 365px wide: one pixel a day of 2030. */
  function track() {
    const element = screen.getByRole("slider", { name: "To" }).parentElement!;
    element.getBoundingClientRect = () =>
      ({ left: 0, width: 365, top: 0, height: 44 }) as DOMRect;
    return element;
  }

  it("starts on the next 12 months, without the jams beyond", async () => {
    desktop();
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(
        ...GEOJSON.body.features,
        jamFeature(4, "Far Jam", { day: "2031-03-01" }),
      ),
    });
    renderApp("/map");

    expect(await rows()).toEqual([
      "Concrete Cypher",
      "Kids Jam Paris",
      "Berlin Breaks",
    ]);
    const from = screen.getByRole("slider", { name: "From" });
    const to = screen.getByRole("slider", { name: "To" });
    expect(from).toHaveAttribute("aria-valuetext", "Now");
    expect(from).toHaveAttribute("aria-valuenow", "0");
    expect(to).toHaveAttribute("aria-valuetext", "1 Jan 2031");
    expect(to).toHaveAttribute("aria-valuenow", "365");
    expect(
      screen.getByRole("button", { name: "1 year", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 jams")).toBeInTheDocument();
  });

  it("sets the dates from a preset, lit only while they match it", async () => {
    desktop();
    api();
    const router = renderApp("/map");
    await rows();

    await userEvent.click(screen.getByRole("button", { name: "6 months" }));
    expect(await rows()).toEqual(["Concrete Cypher", "Kids Jam Paris"]);
    expect(count()).toBe("2 jams in this area · Now – 1 Jul");
    expect(screen.getByText("2 jams")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent),
    ).toEqual(["6 months"]);
    expect(router.state.location.search).toBe("?from=2030-01-01&to=2030-07-01");

    // A day more is no preset.
    const to = screen.getByRole("slider", { name: "To" });
    to.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(to).toHaveAttribute("aria-valuetext", "2 Jul");
    expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);

    // Back to a year: nothing left in the URL.
    await userEvent.click(screen.getByRole("button", { name: "1 year" }));
    expect(router.state.location.search).toBe("");
  });

  it("moves the handles from the keyboard, never past each other", async () => {
    desktop();
    api();
    renderApp("/map");
    await rows();
    const from = screen.getByRole("slider", { name: "From" });
    const to = screen.getByRole("slider", { name: "To" });

    to.focus();
    await userEvent.keyboard("{PageDown}");
    expect(to).toHaveAttribute("aria-valuetext", "1 Dec");
    await userEvent.keyboard("{Home}");
    // A day after From at least.
    expect(to).toHaveAttribute("aria-valuetext", "2 Jan");
    expect(await screen.findByText("No jams")).toBeInTheDocument();
    await userEvent.keyboard("{End}");
    expect(to).toHaveAttribute("aria-valuetext", "1 Jan 2031");

    from.focus();
    await userEvent.keyboard(
      "{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}{ArrowRight}",
    );
    expect(from).toHaveAttribute("aria-valuetext", "2 Jun");
    expect(await rows()).toEqual([
      "Concrete Cypher",
      "Kids Jam Paris",
      "Berlin Breaks",
    ]);
    await userEvent.keyboard("{End}");
    expect(from).toHaveAttribute("aria-valuetext", "31 Dec");
    expect(to).toHaveAttribute("aria-valuetext", "1 Jan 2031");
  });

  it("opens a shared link on its dates and battles, clamped to the next 12 months", async () => {
    desktop();
    api();
    renderApp("/map?from=2029-05-01&to=2030-06-16&battles=kids");

    expect(await rows()).toEqual(["Kids Jam Paris"]);
    expect(count()).toBe("1 jam in this area · Now – 16 Jun");
    expect(
      screen.getByRole("button", { name: "Kids", pressed: true }),
    ).toBeInTheDocument();
  });

  it("shows a jam that started before From and runs into the range", async () => {
    desktop();
    api();
    renderApp("/map?from=2030-06-16&to=2035-01-01");

    // Kids Jam Paris runs 15–16 June.
    expect(await rows()).toEqual(["Kids Jam Paris", "Berlin Breaks"]);
    expect(count()).toBe("2 jams in this area · 16 Jun – 1 Jan 2031");
  });

  it("takes an exact date from the date picker", async () => {
    desktop();
    api();
    renderApp("/map");
    await rows();

    fireEvent.change(screen.getByLabelText("To", { selector: "input" }), {
      target: { value: "2030-06-10" },
    });
    expect(await rows()).toEqual(["Concrete Cypher"]);
    expect(count()).toBe("1 jam in this area · Now – 10 Jun");
    expect(screen.getByText("1 jam")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Marker / })).toHaveLength(1);
  });

  // jsdom has no PointerEvent, and would drop clientX from one: React reads a mouse event alike.
  const pointer = (target: Element, type: string, clientX: number) =>
    fireEvent(
      target,
      new MouseEvent(`pointer${type}`, { bubbles: true, button: 0, clientX }),
    );

  it("follows a drag, then keeps the dates in the URL once let go", async () => {
    desktop();
    api();
    const router = renderApp("/map");
    await rows();
    const slider = track();

    // From the To end of the track to 10 June, day 160.
    pointer(slider, "down", 365);
    pointer(slider, "move", 160);
    expect(screen.getByRole("slider", { name: "To" })).toHaveAttribute(
      "aria-valuetext",
      "10 Jun",
    );
    pointer(slider, "up", 160);

    expect(await rows()).toEqual(["Concrete Cypher"]);
    expect(count()).toBe("1 jam in this area · Now – 10 Jun");
    expect(screen.getByText("1 jam")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Marker / })).toHaveLength(1);
    expect(router.state.location.search).toBe("?from=2030-01-01&to=2030-06-10");
  });

  it("folds the dates into a pill on phones, hidden while a jam is open", async () => {
    api();
    renderApp("/map");
    await screen.findByRole("button", { name: "Marker Concrete Cypher" });

    const pill = screen.getByRole("button", { name: /^Now – 1 Jan 2031/ });
    expect(pill).toHaveTextContent("1 year");
    await userEvent.click(pill);
    await userEvent.click(screen.getByRole("button", { name: "3 months" }));
    expect(screen.getByText("No jams")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List · 0" })).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Hide the dates" }),
    );
    expect(screen.queryByRole("slider")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^Now – 1 Apr/ }));
    await userEvent.click(screen.getByRole("button", { name: "1 year" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Marker Concrete Cypher" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Concrete Cypher" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
