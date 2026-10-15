// What the map page shows and how it narrows it down; pure, so it is tested without a map.
import type { Schemas } from "../../api/client";
import { countryName } from "../../lib/countries";
import { COUNTRY_BOUNDS } from "./countryBounds";

export type Category = Schemas["Category"];
export type MapJam = Schemas["MapJam"] & { lng: number; lat: number };

/** Time filters of the chip row; at most one at a time. */
export type When = "weekend" | "month";
export type Filters = { when: When | null; categories: Category[] };

export const NO_FILTERS: Filters = { when: null, categories: [] };
export const CATEGORIES: Category[] = [
  "one_v_one",
  "two_v_two",
  "crew",
  "seven_to_smoke",
  "bgirl",
  "kids",
];

/** `[west, south, east, north]`; `west > east` when the box crosses the antimeridian. */
export type Bounds = [number, number, number, number];

/** The jams of `GET /api/events.geojson`, with their coordinates, soonest first. */
export function jamsOf(collection: Schemas["FeatureCollection"]): MapJam[] {
  return collection.features
    .map((f) => ({
      ...f.properties,
      lng: f.geometry.coordinates[0] ?? 0,
      lat: f.geometry.coordinates[1] ?? 0,
    }))
    .sort(
      (a, b) =>
        a.starts_on.localeCompare(b.starts_on) || a.name.localeCompare(b.name),
    );
}

/** A local calendar date as `YYYY-MM-DD`. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * First and last day of a time filter, from the viewer's `today`: the coming Saturday and
 * Sunday (or what is left of the current weekend), or the next 30 days.
 */
export function rangeOf(when: When, today: Date): [string, string] {
  if (when === "month") return [isoDate(today), isoDate(addDays(today, 30))];
  const day = today.getDay(); // 0 Sunday … 6 Saturday
  const saturday = addDays(today, day === 0 ? -1 : 6 - day);
  const from = day === 0 ? today : saturday;
  return [isoDate(from), isoDate(addDays(saturday, 1))];
}

/** Whether a jam runs on at least one day of `[from, to]`. */
export function overlaps(
  jam: Pick<MapJam, "starts_on" | "ends_on">,
  [from, to]: [string, string],
): boolean {
  return jam.starts_on <= to && jam.ends_on >= from;
}

/** Time AND categories; within categories, any one is enough. */
export function matchesFilters(
  jam: MapJam,
  filters: Filters,
  today: Date,
): boolean {
  if (filters.when && !overlaps(jam, rangeOf(filters.when, today)))
    return false;
  if (
    filters.categories.length > 0 &&
    !jam.categories.some((c) => filters.categories.includes(c))
  ) {
    return false;
  }
  return true;
}

export function isFiltered(filters: Filters): boolean {
  return filters.when !== null || filters.categories.length > 0;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Every word of the query appears in the name, city, country code or country name. */
export function matchesSearch(
  jam: MapJam,
  query: string,
  language: string,
): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(
    [jam.name, jam.city, jam.country, countryName(jam.country, language)].join(
      " ",
    ),
  );
  return words.every((word) => haystack.includes(word));
}

export function inBounds(
  jam: Pick<MapJam, "lng" | "lat">,
  [west, south, east, north]: Bounds,
): boolean {
  const inLat = jam.lat >= south && jam.lat <= north;
  const inLng =
    west <= east
      ? jam.lng >= west && jam.lng <= east
      : jam.lng >= west || jam.lng <= east;
  return inLat && inLng;
}

/** The box around some jams, or `null` when there are none. */
export function boundsOf(jams: Pick<MapJam, "lng" | "lat">[]): Bounds | null {
  if (jams.length === 0) return null;
  const lngs = jams.map((j) => j.lng);
  const lats = jams.map((j) => j.lat);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

/** How many of the nearest jams a country without any is widened to. */
const NEAREST = 3;

/**
 * The first view: the visitor's country, widened to its nearest jams when none is inside it;
 * every jam when the country is unknown.
 */
export function firstView(
  jams: Pick<MapJam, "lng" | "lat">[],
  country: string | null,
): Bounds | null {
  const home = country ? COUNTRY_BOUNDS[country] : undefined;
  if (!home) return boundsOf(jams);
  if (jams.length === 0 || jams.some((jam) => inBounds(jam, home))) return home;
  const [west, south, east, north] = home;
  const centre = { lng: (west + east) / 2, lat: (south + north) / 2 };
  const nearest = [...jams]
    .sort((a, b) => distanceKm(centre, a) - distanceKm(centre, b))
    .slice(0, NEAREST);
  return boundsOf([
    ...nearest,
    { lng: west, lat: south },
    { lng: east, lat: north },
  ]);
}

/** Cluster count as DESIGN.md §7 writes it: exact below 100, "120+" below 1000, then "1k+". */
export function clusterLabel(count: number): string {
  if (count < 100) return String(count);
  if (count < 1000) return `${Math.floor(count / 10) * 10}+`;
  return `${Math.floor(count / 1000)}k+`;
}

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
