import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { COUNTRY_BOUNDS } from "../../src/features/map/countryBounds";
import { fitParam } from "../../src/features/map/jams";
import { calls, LOGGED_OUT, mockApi, renderApp } from "../support/app";
import { freezeToday, geojson, jamFeature } from "../support/jams";

// Near me opens /map, whose map needs WebGL, which jsdom lacks.
vi.mock("../../src/features/map/JamMap", () => ({
  JamMap: () => <div data-testid="map" />,
}));

const JAMS = geojson(
  jamFeature(1, "Lyon Footwork Fest", {
    country: "FR",
    coordinates: [4.84, 45.76],
    status: "registration_closed",
  }),
  jamFeature(2, "Seoul Power Moves", {
    country: "KR",
    coordinates: [126.98, 37.57],
  }),
  jamFeature(3, "Zurich Toprock Jam", { day: "2030-05-01" }),
  jamFeature(4, "Paris Old School", {
    country: "FR",
    coordinates: [2.35, 48.86],
    day: "2020-05-01",
  }),
);

const main = async () => within(await screen.findByRole("main"));

describe("LandingPage", () => {
  beforeEach(() => freezeToday());

  it("opens on a title, a subtitle and the search, which goes to /search", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    const router = renderApp("/");
    const page = await main();

    // The title, its subtitle, the search, then Register a jam: the page's only heading once the sections
    // below, which hold their place while loading, find nothing to show.
    const title = page.getByRole("heading", {
      level: 1,
      name: "Find your next jam",
    });
    expect(title).not.toHaveClass("sr-only");
    expect(title.nextElementSibling).toHaveTextContent(
      "All of breaking, in one search",
    );
    await waitFor(() => expect(page.getAllByRole("heading")).toHaveLength(1));
    expect(page.getByRole("link", { name: "Register a jam" })).toHaveAttribute(
      "href",
      "/org/jams/new",
    );
    expect(document.title).toBe("BreakingJam");

    await userEvent.type(
      page.getByRole("searchbox", { name: "Search jams and people" }),
      "red bull",
    );
    await userEvent.click(page.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
    expect(router.state.location.search).toBe("?q=red%20bull");
  });

  it("submits from the keyboard through the J button", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    const router = renderApp("/");
    const page = await main();

    await userEvent.type(
      page.getByRole("searchbox", { name: "Search jams and people" }),
      "lilou",
    );
    await userEvent.tab();
    expect(page.getByRole("button", { name: "Search" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.search).toBe("?q=lilou"));
  });

  it("puts the next jams near the visitor after the hero, as grid cards", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/geo": { status: 200, body: { country: "CH" } },
      "GET /api/events.geojson": JAMS,
    });
    renderApp("/");
    const page = await main();
    const heading = await page.findByRole("heading", {
      name: "Next up near you",
    });
    const next = heading.closest("section")!;

    // The hero comes first.
    const hero = page.getByRole("heading", { level: 1 });
    expect(
      hero.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(next).getByText(/Around Switzerland/)).toBeInTheDocument();
    const jams = within(next)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/jams/"));
    expect(jams.map((link) => link.textContent?.split(",")[0])).toEqual([
      "Zurich Toprock Jam",
      "Lyon Footwork Fest",
      "Seoul Power Moves",
    ]);
    // A status shows only when it matters: never "Published".
    expect(within(next).getByText("Registration closed")).toBeInTheDocument();
    expect(within(next).queryByText("Published")).toBeNull();
    // Below lg (jsdom has no media queries), the map link is short.
    expect(within(next).getByRole("link", { name: "Map" })).toHaveAttribute(
      "href",
      "/map",
    );
    // Soonest first, counted down: Zurich is 17 weeks away, the others 21.
    expect(within(next).getByText("In 17 weeks")).toBeInTheDocument();
    expect(within(next).getAllByText("In 21 weeks")).toHaveLength(2);
    // No distance: the reference point is only the country's centre.
    expect(within(next).queryByText(/km/)).toBeNull();
  });

  it("prints the facts under an uploaded flyer only: a generated one already shows them", async () => {
    const uploaded = jamFeature(1, "Basel Bounce", { day: "2030-05-01" });
    Object.assign(uploaded.properties, {
      flyer_card_url: "https://media.test/basel.jpg",
    });
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/geo": { status: 200, body: { country: "CH" } },
      "GET /api/events.geojson": geojson(
        uploaded,
        jamFeature(2, "Zurich Toprock Jam"),
      ),
    });
    renderApp("/");
    const next = (
      await (await main()).findByRole("heading", { name: "Next up near you" })
    ).closest("section")!;

    const cards = within(next).getAllByRole("article");
    expect(
      within(cards[0]!).getByRole("img", { name: "Flyer of Basel Bounce" }),
    ).toHaveAttribute("src", "https://media.test/basel.jpg");
    expect(within(cards[0]!).getByText("Basel")).toBeVisible();
    expect(within(cards[0]!).getByRole("heading")).toHaveTextContent(
      /^Basel Bounce/,
    );
    // The generated card's name and city are for screen readers only.
    expect(within(cards[1]!).queryByText("Zurich")).toBeNull();
    expect(within(cards[1]!).getByText("Zurich Toprock Jam")).toHaveClass(
      "sr-only",
    );
  });

  it("keeps its sections' titles in place while their data loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    renderApp("/");
    const page = await main();

    expect(
      page.getByRole("heading", { name: "Next up near you" }),
    ).toBeInTheDocument();
    expect(
      page.getByRole("heading", { name: "BreakingJam so far" }),
    ).toBeInTheDocument();
    expect(
      page.getByRole("heading", { name: "Just happened" }),
    ).toBeInTheDocument();
    // One "Loading…" each for the cards, the results and the counts.
    expect(page.getAllByText("Loading…")).toHaveLength(3);
  });

  it("hides Next up when no jam is upcoming", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/geo": { status: 200, body: { country: "FR" } },
      "GET /api/events.geojson": geojson(
        jamFeature(4, "Paris Old School", {
          country: "FR",
          coordinates: [2.35, 48.86],
          day: "2020-05-01",
        }),
      ),
    });
    renderApp("/");
    const page = await main();

    // Once the jams are read, the heading's absence means something.
    await waitFor(() =>
      expect(calls(fetch)).toContain("GET /api/events.geojson"),
    );
    const reply: Response =
      await fetch.mock.results[calls(fetch).indexOf("GET /api/events.geojson")]!
        .value;
    await waitFor(() => expect(reply.bodyUsed).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      page.queryByRole("heading", { name: "Next up near you" }),
    ).toBeNull();
  });

  const scene = async (stats: object) => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/stats": { status: 200, body: stats },
    });
    renderApp("/");
    return (
      await screen.findByRole("heading", { name: "BreakingJam so far" })
    ).closest("section")!;
  };

  it("sums up the past and links what's coming up to the map", async () => {
    const section = await scene({
      battles_past: 1234,
      dancers: 742,
      battles_upcoming: 38,
      countries_upcoming: 9,
    });

    // The section shows at once, its counts once they arrive.
    expect(await within(section).findByText("1,234")).toBeInTheDocument();
    expect(within(section).getByText("Past")).toBeInTheDocument();
    expect(within(section).getByText("742")).toBeInTheDocument();
    expect(within(section).getByText("dancers")).toBeInTheDocument();
    const upcoming = within(section).getByRole("link", { name: /Coming up/ });
    expect(upcoming).toHaveAttribute("href", "/map");
    expect(upcoming).toHaveTextContent("38battles");
    expect(upcoming).toHaveTextContent("9countries");
  });

  it("uses the singular for one", async () => {
    const section = await scene({
      battles_past: 1,
      dancers: 1,
      battles_upcoming: 1,
      countries_upcoming: 1,
    });

    const upcoming = await within(section).findByRole("link", {
      name: /Coming up/,
    });
    expect(upcoming).toHaveTextContent("1battle");
    expect(upcoming).toHaveTextContent("1country");
    expect(upcoming).not.toHaveTextContent("battles");
    expect(within(section).getByText("dancer")).toBeInTheDocument();
  });

  it("hides what's coming up with no upcoming battle", async () => {
    const section = await scene({
      battles_past: 263,
      dancers: 742,
      battles_upcoming: 0,
      countries_upcoming: 0,
    });

    expect(await within(section).findByText("263")).toBeInTheDocument();
    expect(within(section).queryByText("Coming up")).toBeNull();
    expect(within(section).queryByRole("link")).toBeNull();
  });

  it("leads the quick filters to the map and to filtered jam lists", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/geo": { status: 200, body: { country: "CH" } },
    });
    const router = renderApp("/");
    const filters = within(
      await (await main()).findByRole("navigation", { name: "Quick filters" }),
    );

    const hrefs = filters
      .getAllByRole("link")
      .slice(1)
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["This weekend", "/jams?when=weekend"],
      ["1v1", "/jams?battles=one_v_one"],
      ["2v2", "/jams?battles=two_v_two"],
      ["Bgirl", "/jams?battles=bgirl"],
      ["Kids", "/jams?battles=kids"],
    ]);

    // jsdom has no geolocation, like a visitor who says no: the map opens on their country.
    const swiss = `/map?fit=${fitParam(COUNTRY_BOUNDS.CH!)}`;
    await waitFor(() =>
      expect(filters.getByRole("link", { name: "Near me" })).toHaveAttribute(
        "href",
        swiss,
      ),
    );
    await userEvent.click(filters.getByRole("link", { name: "Near me" }));
    await waitFor(() =>
      expect(
        router.state.location.pathname + router.state.location.search,
      ).toBe(swiss),
    );
  });

  const RESULT = {
    id: "01920000-0000-7000-8000-000000000024",
    name: "DPC Jam 2026",
    slug: "dpc-jam-2026",
    starts_on: "2029-12-24",
    ends_on: "2029-12-24",
    city: "Zurich",
    country: "CH",
    flyer_card_url: "https://media.test/dpc.jpg",
    has_videos: true,
    battle_count: 4,
    winners: [
      {
        battle: "2v2",
        entry: entry("Saison 2", ["Lil G", "Ventus"]),
      },
      { battle: "1v1 Bgirl", entry: entry(null, ["Nova"]) },
    ],
  };

  function entry(team: string | null, names: string[]) {
    return {
      id: `entry-${names.join("-")}`,
      battle_id: "battle",
      team_name: team,
      crew: null,
      status: "confirmed",
      reached: "winner",
      final_rank: 1,
      video_url: null,
      video_offset_seconds: null,
      created_at: "2029-12-01T00:00:00Z",
      updated_at: "2029-12-01T00:00:00Z",
      members: names.map((name) => ({
        id: `dancer-${name}`,
        dancer_name: name,
        country: "FR",
        deleted: false,
      })),
    };
  }

  const results = async (body: object[]) => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/results": { status: 200, body },
    });
    renderApp("/");
    return within(
      (await screen.findByRole("heading", { name: "Just happened" })).closest(
        "section",
      )!,
    );
  };

  it("shows the latest winners, linked to the jam's battles", async () => {
    const quiet = {
      ...RESULT,
      id: "quiet",
      name: "Basel Bounce",
      slug: "basel-bounce",
      has_videos: false,
      battle_count: 1,
      winners: [RESULT.winners[1]],
    };
    const section = await results([RESULT, quiet]);

    const [dpc, basel] = await section.findAllByRole("article");
    expect(
      within(dpc!).getByRole("link", { name: /^DPC Jam 2026/ }),
    ).toHaveAttribute("href", "/jams/dpc-jam-2026#battles");
    expect(within(dpc!).getAllByRole("img", { name: "Winner" })).toHaveLength(
      2,
    );
    expect(within(dpc!).getByText("Saison 2")).toBeInTheDocument();
    expect(within(dpc!).getByRole("img", { name: "Lil G" })).toHaveAttribute(
      "title",
      "Lil G",
    );
    expect(within(dpc!).getByText("Nova")).toBeInTheDocument();
    // Four battles, two winners shown.
    expect(within(dpc!).getByText("+2 more")).toBeInTheDocument();
    expect(within(dpc!).getByText("Videos available")).toBeInTheDocument();

    expect(within(basel!).queryByText(/more/)).toBeNull();
    expect(within(basel!).queryByText("Videos available")).toBeNull();
    // Below lg the links and the sub line are short.
    expect(section.getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/jams?when=past",
    );
    expect(section.getByText("Winners and battle videos")).toBeInTheDocument();
  });

  it("hides Just happened before any result", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/results": { status: 200, body: [] },
    });
    renderApp("/");
    const page = await main();

    await waitFor(() => expect(calls(fetch)).toContain("GET /api/results"));
    await waitFor(() =>
      expect(page.queryByRole("heading", { name: "Just happened" })).toBeNull(),
    );
  });
});
