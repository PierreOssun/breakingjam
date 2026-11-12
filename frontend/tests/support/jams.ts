import type { Schemas } from "../../src/api/client";

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
  status?: Schemas["EventStatus"];
  /** Upcoming, live or past; by default from the days, seen from `TODAY`. */
  phase?: "upcoming" | "live" | "past";
  coordinates?: [number, number];
  battles?: string[];
  categories?: string[];
  /** Whether a battle has a video; the API says so only for live and past jams. */
  hasVideos?: boolean;
};

/** Where a jam of `day`…`until` stands on `TODAY`, as the API's `phase` says. */
export function phaseOn(day: string, until: string = day) {
  const today = "2030-01-01";
  if (until < today) return "past" as const;
  return day > today ? ("upcoming" as const) : ("live" as const);
}

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
    phase = phaseOn(day, until),
    coordinates = [8.54, 47.38],
    battles = [],
    categories = [],
    hasVideos = false,
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
      phase,
      city,
      country,
      battles,
      categories,
      has_videos: hasVideos,
    },
  };
}

/** The canned reply of `GET /api/events.geojson`. */
export function geojson(...features: ReturnType<typeof jamFeature>[]) {
  return { status: 200, body: { type: "FeatureCollection", features } };
}
