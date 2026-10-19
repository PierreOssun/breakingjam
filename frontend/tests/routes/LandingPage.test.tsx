import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

// jsdom has no WebGL: the preview map is a stub that shows what it was given, and the
// map page a search lands on draws nothing.
vi.mock("../../src/features/map/JamMap", () => ({ JamMap: () => null }));
vi.mock("../../src/features/map/PreviewMap", () => ({
  default: (props: { jams: { name: string }[]; soonest: { name: string } }) => (
    <div data-testid="preview-map" data-soonest={props.soonest?.name}>
      {props.jams.length} markers
    </div>
  ),
}));

const feature = (
  n: number,
  name: string,
  country: string,
  [lng, lat]: [number, number],
  { day = "2030-06-01", status = "published" } = {},
) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: {
    id: `01920000-0000-7000-8000-00000000e00${n}`,
    slug: `jam-00e00${n}`,
    name,
    starts_on: day,
    ends_on: day,
    status,
    city: name.split(" ")[0],
    country,
    battles: [],
    categories: [],
  },
});

const geojson = (...features: ReturnType<typeof feature>[]) => ({
  status: 200,
  body: { type: "FeatureCollection", features },
});

const JAMS = geojson(
  feature(1, "Lyon Footwork Fest", "FR", [4.84, 45.76], {
    status: "registration_closed",
  }),
  feature(2, "Seoul Power Moves", "KR", [126.98, 37.57]),
  feature(3, "Zurich Toprock Jam", "CH", [8.54, 47.38], { day: "2030-05-01" }),
  feature(4, "Paris Old School", "FR", [2.35, 48.86], { day: "2020-05-01" }),
);

const DANCER = {
  id: "01920000-0000-7000-8000-0000000000d1",
  dancer_name: "Lil G",
  aliases: [],
  country: "FR",
  country2: null,
  city: "Paris",
  instagram_handle: "lilg",
  verified: true,
  avatar_url: null,
  avatar_parts: null,
  crews: [],
};

const past = (n: number, name: string, day: string) => ({
  event: {
    id: `jam-${n}`,
    name,
    slug: `jam-${n}`,
    starts_on: day,
    ends_on: day,
    city: "Paris",
    country: "FR",
    status: "completed",
  },
  battle: { id: `b${n}`, name: "1v1 Bboy" },
  role: "competitor",
  reached: "winner",
  final_rank: 1,
});

const main = async () => within(await screen.findByRole("main"));

describe("LandingPage", () => {
  it("opens on the pitch, a jam search and both actions", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    const router = renderApp("/");
    const page = await main();

    expect(
      page.getByRole("heading", { level: 1, name: "Every jam. One map." }),
    ).toBeInTheDocument();
    for (const link of page.getAllByRole("link", { name: "Register a jam" })) {
      expect(link).toHaveAttribute("href", "/org/jams/new");
    }
    expect(
      page.getByRole("heading", { name: "Create your jam" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("BreakingJam");
    // Without jams, counts or a verified dancer, those parts stay out of the way.
    expect(
      page.queryByRole("heading", { name: "Next up near you" }),
    ).toBeNull();
    expect(
      page.queryByRole("heading", { name: "The scene so far" }),
    ).toBeNull();

    await userEvent.type(
      page.getByRole("searchbox", { name: "Search jams" }),
      "red bull{Enter}",
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/map"));
    expect(router.state.location.search).toBe("?q=red%20bull");
  });

  it("shows the map with the upcoming jams and links it to /map", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": JAMS,
    });
    renderApp("/");
    const page = await main();

    const preview = await page.findByTestId("preview-map");
    expect(preview).toHaveTextContent("3 markers");
    expect(preview.dataset.soonest).toBe("Zurich Toprock Jam");
    expect(
      page.getByRole("link", { name: "3 upcoming jams Open the map" }),
    ).toHaveAttribute("href", "/map");
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
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/geo": { status: 200, body: { country: "FR" } },
      "GET /api/events.geojson": geojson(
        feature(4, "Paris Old School", "FR", [2.35, 48.86], {
          day: "2020-05-01",
        }),
      ),
    });
    renderApp("/");
    const page = await main();

    expect(await page.findByTestId("preview-map")).toHaveTextContent(
      "0 markers",
    );
    expect(
      page.queryByRole("heading", { name: "Next up near you" }),
    ).toBeNull();
  });

  it("lets dancers find their page, next to a verified dancer's record", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": {
        status: 200,
        body: { items: [DANCER], next_cursor: null },
      },
      [`GET /api/dancers/${DANCER.id}/events`]: {
        status: 200,
        body: {
          upcoming: [],
          past: [
            past(1, "Jam One", "2025-11-01"),
            past(2, "Jam Two", "2025-09-01"),
            past(3, "Jam Three", "2025-06-01"),
          ],
        },
      },
    });
    const router = renderApp("/");
    const page = await main();
    const band = page
      .getByRole("heading", {
        name: "Every battle you've entered, on one page.",
      })
      .closest("section")!;

    expect(
      await within(band).findByRole("heading", { level: 3, name: "Lil G" }),
    ).toBeInTheDocument();
    expect(await within(band).findByText("Jam One")).toBeInTheDocument();
    expect(within(band).getByText("Jam Two")).toBeInTheDocument();
    expect(within(band).queryByText("Jam Three")).toBeNull();
    expect(within(band).getByText("podiums")).toBeInTheDocument();

    await userEvent.type(
      within(band).getByRole("searchbox", { name: "Find your dancer page" }),
      "lil g{Enter}",
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dancers"),
    );
    expect(router.state.location.search).toBe("?q=lil%20g");
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

  it("shows organisers a generated flyer", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": JAMS,
      // The furthest jam's flyer is the example.
      "GET /api/events/01920000-0000-7000-8000-00000000e002/flyer.svg": {
        status: 200,
        text: '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generated flyer: Seoul Power Moves"></svg>',
        type: "image/svg+xml",
      },
    });
    renderApp("/");
    const band = (
      await screen.findByRole("heading", {
        name: "Put your jam where dancers look.",
      })
    ).closest("section")!;

    expect(
      await within(band).findByRole("img", {
        name: "Generated flyer: Seoul Power Moves",
      }),
    ).toBeInTheDocument();
  });
});
