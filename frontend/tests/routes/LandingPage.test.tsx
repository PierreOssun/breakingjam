import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { calls, LOGGED_OUT, mockApi, renderApp } from "../support/app";
import { freezeToday, geojson, jamFeature } from "../support/jams";

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

    // The title, its subtitle, then the search: the page's only heading.
    const title = page.getByRole("heading", {
      level: 1,
      name: "Find your next jam",
    });
    expect(title).not.toHaveClass("sr-only");
    expect(title.nextElementSibling).toHaveTextContent(
      "All of breaking, in one search",
    );
    expect(page.getAllByRole("heading")).toHaveLength(1);
    expect(page.queryByRole("link", { name: "Register a jam" })).toBeNull();
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
    expect(
      within(next).getByRole("link", { name: "See all on the map" }),
    ).toHaveAttribute("href", "/map");
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

  it("sums up the scene: counts, then the busiest countries", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/stats": {
        status: 200,
        body: {
          countries: 12,
          battles: 1234,
          dancers: 56,
          battles_by_country: Array.from({ length: 11 }, (_, i) => ({
            country: i === 0 ? "BE" : `A${String.fromCharCode(65 + i)}`,
            battles: 28 - i,
          })),
        },
      },
    });
    renderApp("/");
    const scene = (
      await screen.findByRole("heading", { name: "The scene so far" })
    ).closest("section")!;

    expect(within(scene).getByText("1,234")).toBeInTheDocument();
    expect(within(scene).getByText("battles")).toBeInTheDocument();
    expect(within(scene).getByText("56")).toBeInTheDocument();
    const chips = within(
      within(scene).getByRole("list", { name: "Battles by country" }),
    ).getAllByRole("listitem");
    // The ten busiest countries, then how many more.
    expect(chips).toHaveLength(11);
    expect(chips[0]).toHaveTextContent("Belgium28");
    expect(chips.at(-1)).toHaveTextContent("+1 more");
  });
});
