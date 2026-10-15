import {
  type MapJam,
  NO_FILTERS,
  boundsOf,
  clusterLabel,
  distanceKm,
  inBounds,
  jamsOf,
  matchesFilters,
  matchesSearch,
  rangeOf,
} from "./jams";

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
