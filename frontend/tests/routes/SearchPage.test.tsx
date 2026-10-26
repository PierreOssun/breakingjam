import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";
import { freezeToday, geojson, jamFeature } from "../support/jams";

// jsdom has no WebGL: the card's mini map is a stand-in.
vi.mock("../../src/features/map/StaticMap", () => ({
  default: () => <div>Mini map</div>,
}));

const NOBODY = { status: 200, body: { items: [], next_cursor: null } };
const place = (name: string, country: string, lng: number, lat: number) => ({
  status: 200,
  body: { place: { name, country, lng, lat, population: 100_000 } },
});
const NO_PLACE = { status: 200, body: { place: null } };

/** Jams around Mulhouse (47.75, 7.33): three within 500 km, one farther, one past. */
const AROUND_MULHOUSE = geojson(
  jamFeature(1, "Paris Cypher Sessions", {
    country: "FR",
    coordinates: [2.35, 48.86],
  }),
  jamFeature(2, "Zurich Toprock Jam", {
    country: "CH",
    coordinates: [8.54, 47.37],
  }),
  jamFeature(3, "Berlin Floor Wars", {
    country: "DE",
    coordinates: [13.4, 52.52],
  }),
  jamFeature(4, "Lyon Footwork Fest", {
    country: "FR",
    coordinates: [4.83, 45.76],
  }),
  jamFeature(5, "Freiburg Classic", {
    country: "DE",
    coordinates: [7.85, 48.0],
    day: "2029-06-01",
    status: "completed",
  }),
);

const LILOU = {
  id: "01920000-0000-7000-8000-0000000000d1",
  dancer_name: "Lilou",
  aliases: [],
  country: "FR",
  country2: null,
  city: "Lyon",
  instagram_handle: null,
  verified: true,
  avatar_url: null,
  avatar_parts: null,
  crews: [],
};

const section = async (name: string) =>
  within(
    (await screen.findByRole("heading", { level: 2, name })).closest(
      "section",
    )!,
  );

describe("SearchPage", () => {
  beforeEach(() => freezeToday());

  it("shows the jams and the people the words match", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(
        jamFeature(1, "Lyon Footwork Fest", { country: "FR" }),
        jamFeature(2, "Seoul Power Moves", { country: "KR" }),
      ),
      "GET /api/dancers": {
        status: 200,
        body: { items: [LILOU], next_cursor: null },
      },
    });
    renderApp("/search?q=lyon");

    const jams = await section("Jams");
    await waitFor(() => expect(jams.getAllByRole("link")).toHaveLength(1));
    expect(jams.getByRole("link")).toHaveAttribute(
      "href",
      "/jams/lyon-footwork-fest-1",
    );
    const people = await section("People");
    expect(await people.findByRole("link", { name: /Lilou/ })).toHaveAttribute(
      "href",
      `/dancers/${LILOU.id}`,
    );
    expect(
      screen.getByRole("searchbox", { name: "Search jams and people" }),
    ).toHaveValue("lyon");
  });

  it("says once when nothing matches anywhere, and searches again from its field", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(
        jamFeature(1, "Lyon Jam", { country: "FR" }),
      ),
      "GET /api/dancers": NOBODY,
      "GET /api/places": NO_PLACE,
    });
    const router = renderApp("/search?q=nowhere");

    expect(
      await screen.findByText("Nothing matches “nowhere”."),
    ).toBeInTheDocument();
    // One empty state: no empty sections around it.
    expect(screen.queryByRole("heading", { name: "Jams" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "People" })).toBeNull();

    const field = screen.getByRole("searchbox", {
      name: "Search jams and people",
    });
    await userEvent.clear(field);
    await userEvent.type(field, "lyon{Enter}");
    await waitFor(() => expect(router.state.location.search).toBe("?q=lyon"));
    // The same field stays, focus and all.
    expect(field).toHaveFocus();
    expect(field).toHaveValue("lyon");
  });

  it("sends the rest of a long jam list to the map", async () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      jamFeature(i + 10, `Zurich Jam ${i + 10}`),
    );
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(...many),
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    renderApp("/search?q=zurich");

    const jams = await section("Jams");
    expect(
      await jams.findByRole("link", { name: "See all on the map" }),
    ).toHaveAttribute("href", "/map?q=zurich");
    expect(
      within(jams.getByRole("list", { name: "Jams" })).getAllByRole("link"),
    ).toHaveLength(10);
  });

  it("names the 3 nearest upcoming jams to a city that has none", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": AROUND_MULHOUSE,
      "GET /api/dancers": NOBODY,
      "GET /api/places": place("Mulhouse", "FR", 7.32866, 47.75205),
    });
    renderApp("/search?q=Mulhouse");

    const card = within(
      (await screen.findByRole("heading", { name: "Near Mulhouse" })).closest(
        "section",
      )!,
    );
    expect(card.getByText("FR")).toBeInTheDocument();
    expect(
      card.getByText("No jam in Mulhouse yet. Here are the closest."),
    ).toBeInTheDocument();
    // Nearest first; Berlin is beyond 500 km and Freiburg is over.
    const rows = card
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.startsWith("/jams/"));
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/jams/zurich-toprock-jam-2",
      "/jams/lyon-footwork-fest-4",
      "/jams/paris-cypher-sessions-1",
    ]);
    expect(rows.map((row) => row.textContent?.match(/(\d+) km/)?.[1])).toEqual([
      "100",
      "292",
      "388",
    ]);
    const map = card.getByRole("link", {
      name: "Open the map around Mulhouse",
    });
    expect(map.getAttribute("href")).toMatch(
      /^\/map\?lat=47\.75205&lng=7\.32866&fit=2\.3500,45\.7600,8\.5400,48\.8600$/,
    );
    // Nothing else matched: no empty Jams or People sections.
    expect(screen.queryByRole("heading", { name: "Jams" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "People" })).toBeNull();
  });

  it("shows the card and the jams when the words name a city and a jam", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": AROUND_MULHOUSE,
      "GET /api/dancers": NOBODY,
      "GET /api/places": place("Lyon", "FR", 4.84, 45.76),
    });
    renderApp("/search?q=lyon");

    const card = within(
      (await screen.findByRole("heading", { name: "Near Lyon" })).closest(
        "section",
      )!,
    );
    // Lyon has a jam: no "closest" line.
    expect(card.queryByText(/No jam in Lyon yet/)).toBeNull();
    const jams = await section("Jams");
    expect(
      jams.getByRole("link", { name: /Lyon Footwork Fest/ }),
    ).toHaveAttribute("href", "/jams/lyon-footwork-fest-4");
  });

  it("keeps the place and its map button when no jam is within 500 km", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": AROUND_MULHOUSE,
      "GET /api/dancers": NOBODY,
      "GET /api/places": place("Reykjavík", "IS", -21.89541, 64.13548),
    });
    renderApp("/search?q=Reykjavik");

    const card = within(
      (await screen.findByRole("heading", { name: "Near Reykjavík" })).closest(
        "section",
      )!,
    );
    expect(
      card.getByText("No upcoming jams within 500 km of Reykjavík."),
    ).toBeInTheDocument();
    expect(card.queryByText(/Here are the closest/)).toBeNull();
    // Only the map button links anywhere.
    const links = card.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual([
      "Open the map around Reykjavík",
    ]);
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });
});
