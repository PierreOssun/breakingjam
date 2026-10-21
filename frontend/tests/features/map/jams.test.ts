import {
  type MapJam,
  NO_FILTERS,
  boundsOf,
  byDate,
  clusterLabel,
  distanceKm,
  featuredJams,
  firstView,
  inBounds,
  jamsOf,
  matchesFilters,
  matchesSearch,
  narrow,
  rangeOf,
} from "../../../src/features/map/jams";

function jam(overrides: Partial<MapJam> = {}): MapJam {
  return {
    id: "j",
    name: "Zurich Toprock Jam",
    slug: "zurich-toprock-jam",
    starts_on: "2026-10-17",
    ends_on: "2026-10-17",
    status: "published",
    city: "Zürich",
    country: "CH",
    battles: ["1v1 Bboy"],
    categories: ["one_v_one"],
    lng: 8.54,
    lat: 47.37,
    ...overrides,
  };
}

// Months are 0-based in the Date constructor: 9 is October.
const thursday = new Date(2026, 9, 15);
const saturday = new Date(2026, 9, 17);
const sunday = new Date(2026, 9, 18);

describe("map jams", () => {
  it("flattens the GeoJSON, soonest first", () => {
    const point = (name: string, startsOn: string, lng: number) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, 1] },
      properties: { ...jam({ name, starts_on: startsOn }) },
    });
    const jams = jamsOf({
      type: "FeatureCollection",
      features: [point("B", "2026-11-01", 2), point("A", "2026-10-01", 3)],
    } as never);
    expect(jams.map((j) => [j.name, j.lng, j.lat])).toEqual([
      ["A", 3, 1],
      ["B", 2, 1],
    ]);
  });

  it("reads 'this weekend' from any day of the week", () => {
    expect(rangeOf("weekend", thursday)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(rangeOf("weekend", saturday)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(rangeOf("weekend", sunday)).toEqual(["2026-10-18", "2026-10-18"]);
    expect(rangeOf("month", thursday)).toEqual(["2026-10-15", "2026-11-14"]);
  });

  it("filters by time and by any of the chosen categories", () => {
    const weekend = { ...NO_FILTERS, when: "weekend" as const };
    expect(matchesFilters(jam(), weekend, thursday)).toBe(true);
    expect(
      matchesFilters(
        jam({ starts_on: "2026-10-24", ends_on: "2026-10-24" }),
        weekend,
        thursday,
      ),
    ).toBe(false);
    // A jam running Friday to Saturday still counts for the weekend.
    expect(
      matchesFilters(
        jam({ starts_on: "2026-10-16", ends_on: "2026-10-17" }),
        weekend,
        thursday,
      ),
    ).toBe(true);

    const crewOrKids = {
      ...NO_FILTERS,
      categories: ["crew" as const, "kids" as const],
    };
    expect(matchesFilters(jam(), crewOrKids, thursday)).toBe(false);
    expect(
      matchesFilters(
        jam({ categories: ["one_v_one", "kids"] }),
        crewOrKids,
        thursday,
      ),
    ).toBe(true);
    expect(matchesFilters(jam(), NO_FILTERS, thursday)).toBe(true);
  });

  it("keeps the jams over before today for 'past jams'", () => {
    const past = { ...NO_FILTERS, when: "past" as const };
    expect(matchesFilters(jam(), past, sunday)).toBe(true);
    expect(matchesFilters(jam(), past, saturday)).toBe(false);
  });

  it("orders upcoming jams soonest first, then past ones most recent first", () => {
    const named = (name: string, day: string) =>
      jam({ name, starts_on: day, ends_on: day });
    const jams = [
      named("old", "2026-10-01"),
      named("later", "2026-11-01"),
      named("recent", "2026-10-17"),
      named("soon", "2026-10-20"),
    ];
    expect(jams.sort(byDate(sunday)).map((j) => j.name)).toEqual([
      "soon",
      "later",
      "recent",
      "old",
    ]);
  });

  it("narrows to upcoming jams, unless 'past jams' or a search looks further", () => {
    const named = (name: string, day: string) =>
      jam({ id: name, name, starts_on: day, ends_on: day });
    const jams = [
      named("Old Zurich", "2026-10-01"),
      named("New Zurich", "2026-10-20"),
    ];
    const names = (filters = NO_FILTERS, search = "") =>
      narrow(jams, filters, search, "en", sunday).map((j) => j.name);

    expect(names()).toEqual(["New Zurich"]);
    expect(names({ ...NO_FILTERS, when: "past" })).toEqual(["Old Zurich"]);
    // A search looks through every jam, upcoming first.
    expect(names(NO_FILTERS, "zurich")).toEqual(["New Zurich", "Old Zurich"]);
  });

  it("searches name, city and country, ignoring case and accents", () => {
    expect(matchesSearch(jam(), "zurich", "en")).toBe(true);
    expect(matchesSearch(jam(), "TOPROCK zur", "en")).toBe(true);
    expect(matchesSearch(jam(), "switzerland", "en")).toBe(true);
    expect(matchesSearch(jam(), "suisse", "fr")).toBe(true);
    expect(matchesSearch(jam(), "ch", "en")).toBe(true);
    expect(matchesSearch(jam(), "berlin", "en")).toBe(false);
    expect(matchesSearch(jam(), "   ", "en")).toBe(true);
  });

  it("knows which jams are in view, across the antimeridian too", () => {
    expect(inBounds(jam(), [5, 45, 10, 48])).toBe(true);
    expect(inBounds(jam(), [9, 45, 10, 48])).toBe(false);
    expect(inBounds({ lng: 179, lat: 0 }, [170, -10, -170, 10])).toBe(true);
    expect(inBounds({ lng: -175, lat: 0 }, [170, -10, -170, 10])).toBe(true);
    expect(inBounds({ lng: 0, lat: 0 }, [170, -10, -170, 10])).toBe(false);
    expect(
      boundsOf([
        { lng: 2, lat: 48 },
        { lng: 13, lat: 52 },
      ]),
    ).toEqual([2, 48, 13, 52]);
    expect(boundsOf([])).toBeNull();
  });

  it("starts on the visitor's country, widened to its nearest jams when it has none", () => {
    const zurich = { lng: 8.54, lat: 47.37 };
    const paris = { lng: 2.35, lat: 48.86 };
    const berlin = { lng: 13.4, lat: 52.52 };
    const seoul = { lng: 126.98, lat: 37.57 };
    const jams = [zurich, paris, berlin, seoul];
    expect(firstView(jams, null)).toEqual([2.35, 37.57, 126.98, 52.52]);
    expect(firstView(jams, "ZZ")).toEqual([2.35, 37.57, 126.98, 52.52]);
    expect(firstView(jams, "CH")).toEqual([5.9, 45.8, 10.5, 47.8]);
    // No jam in Austria: its box and the three nearest jams, not Seoul.
    expect(firstView(jams, "AT")).toEqual([2.35, 46.3, 17.2, 52.52]);
    expect(firstView([], "AT")).toEqual([9.5, 46.3, 17.2, 49.1]);
  });

  it("features the visitor's country first, then the nearest jams", () => {
    const at = (
      name: string,
      country: string,
      lng: number,
      lat: number,
      starts_on = "2030-06-01",
    ) =>
      jam({ id: name, name, country, lng, lat, starts_on, ends_on: starts_on });
    const jams = [
      at("Over", "CH", 8.54, 47.37, "2026-10-01"),
      at("Zurich", "CH", 8.54, 47.37),
      at("Seoul", "KR", 126.98, 37.57),
      at("Paris", "FR", 2.35, 48.86),
      at("Geneva", "CH", 6.14, 46.2, "2030-07-01"),
      at("Berlin", "DE", 13.4, 52.52),
    ];
    const names = (country: string | null) =>
      featuredJams(jams, country, thursday).map((j) => j.name);

    // Past jams never show; the country's own come first, in date order.
    expect(names("CH")).toEqual([
      "Zurich",
      "Geneva",
      "Paris",
      "Berlin",
      "Seoul",
    ]);
    // No jam in Austria: the nearest to its centre.
    expect(names("AT")).toEqual([
      "Zurich",
      "Berlin",
      "Geneva",
      "Paris",
      "Seoul",
    ]);
    // Unknown country: the soonest anywhere, at most six.
    expect(names(null)).toEqual([
      "Zurich",
      "Seoul",
      "Paris",
      "Berlin",
      "Geneva",
    ]);
    const many = Array.from({ length: 8 }, (_, i) => at(`J${i}`, "FR", 2, 48));
    expect(featuredJams(many, "FR", thursday)).toHaveLength(6);
  });

  it("writes cluster counts the DESIGN.md way", () => {
    expect([2, 99, 100, 123, 999, 1000, 2400].map(clusterLabel)).toEqual([
      "2",
      "99",
      "100+",
      "120+",
      "990+",
      "1k+",
      "2k+",
    ]);
  });

  it("measures distance on the globe", () => {
    // Paris to Zurich: 487.88 km by an independent haversine computation.
    expect(
      distanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 47.3769, lng: 8.5417 }),
    ).toBeCloseTo(487.88, 1);
  });
});
