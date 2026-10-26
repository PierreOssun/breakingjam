import type { MapJam } from "../../../src/features/map/jams";
import {
  formatKm,
  hasJamIn,
  mapLink,
  nearestTo,
} from "../../../src/features/places/near";

const MULHOUSE = {
  name: "Mulhouse",
  country: "FR",
  lng: 7.33,
  lat: 47.75,
  population: 111430,
};
const today = new Date(2030, 0, 1);

const jam = (
  id: string,
  lng: number,
  lat: number,
  extra: Partial<MapJam> = {},
) =>
  ({
    id,
    name: id,
    slug: id,
    city: id,
    country: "FR",
    starts_on: "2030-06-01",
    ends_on: "2030-06-01",
    status: "published",
    battles: [],
    categories: [],
    lng,
    lat,
    ...extra,
  }) as MapJam;

describe("near a place", () => {
  const zurich = jam("Zurich", 8.54, 47.37);
  const basel = jam("Basel", 7.59, 47.56);
  const lyon = jam("Lyon", 4.83, 45.76);
  const paris = jam("Paris", 2.35, 48.86);
  const berlin = jam("Berlin", 13.4, 52.52);
  const past = jam("Past", 7.34, 47.76, { ends_on: "2029-06-01" });

  it("lists the 3 nearest upcoming jams within 500 km, nearest first", () => {
    const near = nearestTo(
      MULHOUSE,
      [paris, berlin, past, zurich, lyon, basel],
      today,
    );
    expect(near.map(({ jam }) => jam.id)).toEqual(["Basel", "Zurich", "Lyon"]);
    expect(nearestTo(MULHOUSE, [berlin], today)).toEqual([]);
  });

  it("knows when a jam is in the place, by its city or its distance", () => {
    expect(hasJamIn(MULHOUSE, [zurich], today)).toBe(false);
    expect(hasJamIn(MULHOUSE, [jam("x", 7.4, 47.8)], today)).toBe(true);
    expect(
      hasJamIn(MULHOUSE, [jam("x", 0, 0, { city: "Mülhouse" })], today),
    ).toBe(true);
    // A city of the same name elsewhere is not this one.
    expect(
      hasJamIn(
        MULHOUSE,
        [jam("x", 0, 0, { city: "Mulhouse", country: "US" })],
        today,
      ),
    ).toBe(false);
    expect(hasJamIn(MULHOUSE, [past], today)).toBe(false);
  });

  it("frames the map link on the place and its jams", () => {
    expect(mapLink(MULHOUSE, [zurich, lyon])).toBe(
      "/map?lat=47.75&lng=7.33&fit=4.8300,45.7600,8.5400,47.7500",
    );
    expect(mapLink(MULHOUSE, [])).toBe(
      "/map?lat=47.75&lng=7.33&fit=7.3300,47.7500,7.3300,47.7500",
    );
  });

  it("rounds distances to the kilometre", () => {
    expect(formatKm(99.6, "en")).toBe("100 km");
    // French puts a narrow no-break space before the unit.
    expect(formatKm(292.2, "fr")).toMatch(/^292\skm$/);
  });
});
