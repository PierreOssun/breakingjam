import { screen, within } from "@testing-library/react";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

const feature = (
  n: number,
  name: string,
  country: string,
  [lng, lat]: [number, number],
) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: {
    id: `01920000-0000-7000-8000-00000000e00${n}`,
    slug: `jam-00e00${n}`,
    name,
    starts_on: "2030-06-01",
    ends_on: "2030-06-01",
    status: "published",
    city: name.split(" ")[0],
    country,
    battles: [],
    categories: [],
  },
});

const GEOJSON = {
  type: "FeatureCollection",
  features: [
    feature(1, "Lyon Footwork Fest", "FR", [4.84, 45.76]),
    feature(2, "Seoul Power Moves", "KR", [126.98, 37.57]),
    feature(3, "Zurich Toprock Jam", "CH", [8.54, 47.38]),
  ],
};

describe("LandingPage", () => {
  it("pitches the map with two actions", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/");
    const main = within(await screen.findByRole("main"));

    expect(
      main.getByRole("heading", { level: 1, name: "Every jam. One map." }),
    ).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Find a jam" })).toHaveAttribute(
      "href",
      "/map",
    );
    for (const link of main.getAllByRole("link", { name: "Register a jam" })) {
      expect(link).toHaveAttribute("href", "/org/jams/new");
    }
    expect(main.getByRole("link", { name: "Open the map" })).toHaveAttribute(
      "href",
      "/map",
    );
    expect(
      main.getByRole("heading", { name: "Create your jam" }),
    ).toBeInTheDocument();
    expect(
      main.getByRole("heading", { name: "Submit it" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("BreakingJam");
    // Without jams or counts, those sections stay out of the way.
    expect(
      main.queryByRole("heading", { name: "Featured near you" }),
    ).toBeNull();
    expect(
      main.queryByRole("heading", { name: "BreakingJam in numbers" }),
    ).toBeNull();
  });

  it("features upcoming jams in the visitor's country, then the nearest", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/geo": { status: 200, body: { country: "CH" } },
      "GET /api/events.geojson": { status: 200, body: GEOJSON },
    });
    renderApp("/");
    const featured = (
      await screen.findByRole("heading", { name: "Featured near you" })
    ).closest("section")!;

    expect(
      within(featured).getByText("Upcoming jams in Switzerland and nearby"),
    ).toBeInTheDocument();
    const jams = within(featured)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/jams/"));
    expect(jams.map((link) => link.textContent?.split(",")[0])).toEqual([
      "Zurich Toprock Jam",
      "Lyon Footwork Fest",
      "Seoul Power Moves",
    ]);
    expect(
      within(featured).getByRole("link", { name: "See the map" }),
    ).toHaveAttribute("href", "/map");
  });

  it("counts countries, battles and dancers, and battles by country", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/stats": {
        status: 200,
        body: {
          countries: 12,
          battles: 1234,
          dancers: 56,
          battles_by_country: Array.from({ length: 11 }, (_, i) => ({
            country: i === 0 ? "CH" : `A${String.fromCharCode(65 + i)}`,
            battles: 20 - i,
          })),
        },
      },
    });
    renderApp("/");
    const counts = (
      await screen.findByRole("heading", { name: "BreakingJam in numbers" })
    ).closest("section")!;

    expect(within(counts).getByText("1,234")).toBeInTheDocument();
    expect(within(counts).getByText("56")).toBeInTheDocument();
    const switzerland = within(counts).getByText("Switzerland").closest("li")!;
    expect(switzerland).toHaveTextContent("20 battles");
    // The ten busiest countries, then how many more.
    expect(within(counts).getAllByRole("listitem")).toHaveLength(10);
    expect(within(counts).getByText("+ 1 more country")).toBeInTheDocument();
  });
});
