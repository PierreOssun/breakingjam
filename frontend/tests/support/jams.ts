/** The "today" of tests that need jams to be upcoming: the fixtures' jams are in 2030. */
export const TODAY = new Date(2030, 0, 1, 12);

/** Freezes the clock at `TODAY` (only `Date`; timers stay real). `setup.ts` unfreezes it. */
export function freezeToday(at: Date = TODAY) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
}

type JamOptions = {
  country?: string;
  city?: string;
  day?: string;
  /** The last day, when the jam runs several. */
  until?: string;
  status?: string;
  coordinates?: [number, number];
  battles?: string[];
  categories?: string[];
};

/** A jam of `GET /api/events.geojson`, with slug `<name>-<n>`. */
export function jamFeature(
  n: number,
  name: string,
  {
    country = "CH",
    city = name.split(" ")[0],
    day = "2030-06-01",
    until = day,
    status = "published",
    coordinates = [8.54, 47.38],
    battles = [],
    categories = [],
  }: JamOptions = {},
) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      id: `01920000-0000-7000-8000-${String(n).padStart(12, "0")}`,
      slug: `${name.toLowerCase().replaceAll(" ", "-")}-${n}`,
      name,
      starts_on: day,
      ends_on: until,
      status,
      city,
      country,
      battles,
      categories,
    },
  };
}

/** The canned reply of `GET /api/events.geojson`. */
export function geojson(...features: ReturnType<typeof jamFeature>[]) {
  return { status: 200, body: { type: "FeatureCollection", features } };
}
