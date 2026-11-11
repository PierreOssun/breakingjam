import {
  cardCountdown,
  nextUp,
  referencePoint,
} from "../../../src/features/landing/landing";
import type { MapJam } from "../../../src/features/map/jams";

const ZURICH = { lng: 8.54, lat: 47.37 };

function jam(
  name: string,
  [lng, lat]: [number, number],
  starts_on = "2030-06-01",
  phase: MapJam["phase"] = "upcoming",
): MapJam {
  return {
    id: name,
    name,
    slug: name.toLowerCase(),
    starts_on,
    ends_on: starts_on,
    status: "published",
    phase,
    city: name,
    country: "CH",
    battles: [],
    categories: [],
    flyer_card_url: null,
    has_videos: false,
    lng,
    lat,
  };
}

const over = jam("Over", [8.54, 47.37], "2029-10-01", "past");
const basel = jam("Basel", [7.59, 47.56], "2030-01-28");
const paris = jam("Paris", [2.35, 48.86], "2029-11-29");
const lyon = jam("Lyon", [4.84, 45.76], "2030-03-01");
const zurich = jam("Zurich", [8.55, 47.38], "2029-12-12");
const seoul = jam("Seoul", [126.98, 37.57], "2029-11-01");

describe("landing", () => {
  it("measures near you from the position, else the country's centre", () => {
    expect(referencePoint(ZURICH, "FR")).toEqual(ZURICH);
    const swiss = referencePoint(null, "CH")!;
    expect(swiss.lng).toBeCloseTo(8.2, 0);
    expect(swiss.lat).toBeCloseTo(46.8, 0);
    expect(referencePoint(null, null)).toBeNull();
  });

  it("lists Next up soonest first, near jams before far ones", () => {
    const names = (jams: MapJam[], from = ZURICH) =>
      nextUp(jams, from).map((j) => j.name);
    // The bug of landing v3: 29 Nov came after 28 Jan.
    expect(names([basel, paris, lyon, zurich, over])).toEqual([
      "Paris",
      "Zurich",
      "Basel",
      "Lyon",
    ]);
    // Seoul is the soonest, but never beats four jams near Zurich.
    expect(names([seoul, basel, paris, lyon, zurich])).not.toContain("Seoul");
    // Fewer than four near: the nearest far ones top it up, still by date.
    expect(names([seoul, basel])).toEqual(["Seoul", "Basel"]);
    // Nowhere to measure from: the soonest anywhere.
    expect(nextUp([basel, seoul, over], null).map((j) => j.name)).toEqual([
      "Seoul",
      "Basel",
    ]);
  });

  it("counts down in days, then whole weeks", () => {
    const today = new Date(2030, 0, 1, 12);
    const on = (day: string, phase: MapJam["phase"] = "upcoming") =>
      cardCountdown({ starts_on: day, phase }, today);
    expect(on("2029-12-31", "live")).toEqual({ key: "live" });
    expect(on("2030-01-01")).toEqual({ key: "today" });
    expect(on("2030-01-02")).toEqual({ key: "tomorrow" });
    expect(on("2030-01-03")).toEqual({ key: "days", count: 2 });
    expect(on("2030-01-21")).toEqual({ key: "days", count: 20 });
    expect(on("2030-01-22")).toEqual({ key: "weeks", count: 3 });
    expect(on("2030-02-05")).toEqual({ key: "weeks", count: 5 });
    expect(on("2030-02-04")).toEqual({ key: "weeks", count: 4 });
  });
});
