import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import type { JamMap } from "../features/map/JamMap";
import { LOGGED_OUT, mockApi, renderApp } from "../test/app";

// jsdom has no WebGL: the map is a list of marker buttons that drives the same callbacks.
vi.mock("../features/map/JamMap", () => ({
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

const feature = (
  n: number,
  jam: {
    name: string;
    starts_on: string;
    ends_on: string;
    status: string;
    city: string;
    country: string;
    battles: string[];
    categories: string[];
  },
  [lng, lat]: [number, number],
) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: {
    id: `01920000-0000-7000-8000-00000000e00${n}`,
    slug: `${jam.name.toLowerCase().replaceAll(" ", "-")}-00e00${n}`,
    ...jam,
  },
});

const GEOJSON = {
  type: "FeatureCollection",
  features: [
    feature(
      1,
      {
        name: "Berlin Breaks",
        starts_on: "2030-07-20",
        ends_on: "2030-07-20",
        status: "published",
        city: "Berlin",
        country: "DE",
        battles: ["2v2 Mixed"],
        categories: ["two_v_two"],
      },
      [13.4, 52.52],
    ),
    feature(
      2,
      {
        name: "Concrete Cypher",
        starts_on: "2030-06-08",
        ends_on: "2030-06-08",
        status: "published",
        city: "Zurich",
        country: "CH",
        battles: ["1v1 Bboy", "1v1 Bgirl"],
        categories: ["one_v_one", "bgirl"],
      },
      [8.54, 47.37],
    ),
    feature(
      3,
      {
        name: "Kids Jam Paris",
        starts_on: "2030-06-15",
        ends_on: "2030-06-16",
        status: "registration_closed",
        city: "Paris",
        country: "FR",
        battles: ["3v3 Crew", "1v1 Kids"],
        categories: ["crew", "kids"],
      },
      [2.35, 48.86],
    ),
  ],
};

function api() {
  return mockApi({
    "GET /api/auth/me": LOGGED_OUT,
    "GET /api/events.geojson": { status: 200, body: GEOJSON },
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
  await screen.findByText(/in this area/);
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
  it("lists the jams in view, soonest first, and counts them", async () => {
    desktop();
    api();
    renderApp("/map");

    expect(await rows()).toEqual([
      "Concrete Cypher",
      "Kids Jam Paris",
      "Berlin Breaks",
    ]);
    expect(count()).toBe("3 jams in this area");
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
    expect(count()).toBe("2 jams in this area");
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
    await userEvent.click(screen.getByRole("button", { name: "This weekend" }));
    expect(await rows()).toEqual(["Concrete Cypher"]);

    // One time filter at a time.
    await userEvent.click(screen.getByRole("button", { name: "Next 30 days" }));
    expect(
      screen.getByRole("button", { name: "This weekend" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(await rows()).toEqual(["Concrete Cypher", "Kids Jam Paris"]);
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
    expect(within(popup).getByText("Published")).toBeInTheDocument();
    expect(
      within(popup).getByRole("link", { name: "View jam" }),
    ).toHaveAttribute("href", "/jams/concrete-cypher-00e002");

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
    ).toHaveAttribute("href", "/jams/concrete-cypher-00e002");

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

    await userEvent.click(screen.getByRole("button", { name: "List" }));
    expect(count()).toBe("3 jams in this area");
    expect(
      screen.getByRole("link", { name: /^Kids Jam Paris ?, / }),
    ).toHaveAttribute("href", "/jams/kids-jam-paris-00e003");

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
