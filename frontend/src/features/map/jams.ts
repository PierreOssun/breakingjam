// What the map page shows and how it narrows it down; pure, so it is tested without a map.
import type { Schemas } from "../../api/client";
import { countryName } from "../../lib/countries";
import { COUNTRY_BOUNDS } from "./countryBounds";
import {
  defaultRange,
  isoRange,
  type Range,
  rangeFromUrl,
  runsIn,
  sameRange,
  writeRange,
} from "./range";

export type Category = Schemas["Category"];
export type MapJam = Schemas["MapJam"] & { lng: number; lat: number };

/** Time filters of the chip row; at most one at a time. */
export type When = "weekend" | "month" | "past";
export type Filters = { when: When | null; categories: Category[] };

export const NO_FILTERS: Filters = { when: null, categories: [] };
export const WHENS: When[] = ["weekend", "month", "past"];
/** The map's time chips: its date range replaces "Next 30 days" (M33). */
export const MAP_WHENS: When[] = ["weekend", "past"];
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
export function rangeOf(
  when: "weekend" | "month",
  today: Date,
): [string, string] {
  if (when === "month") return [isoDate(today), isoDate(addDays(today, 30))];
  const day = today.getDay(); // 0 Sunday … 6 Saturday
  const saturday = addDays(today, day === 0 ? -1 : 6 - day);
  const from = day === 0 ? today : saturday;
  return [isoDate(from), isoDate(addDays(saturday, 1))];
}

/** Where a preview leads: straight to the jam's battles when they have videos (DESIGN.md §4.3). */
export function jamPath(jam: Pick<MapJam, "slug" | "has_videos">): string {
  return `/jams/${jam.slug}${jam.has_videos ? "#battles" : ""}`;
}

/** Whether a jam is over, by its own calendar (the API's `phase`). */
export function isPast(jam: Pick<MapJam, "phase">): boolean {
  return jam.phase === "past";
}

/** Live and upcoming jams soonest first, then past ones most recent first (DESIGN.md §4.14). */
export function byDate() {
  return (a: MapJam, b: MapJam) => {
    const past = isPast(a);
    if (past !== isPast(b)) return past ? 1 : -1;
    return past
      ? b.starts_on.localeCompare(a.starts_on)
      : a.starts_on.localeCompare(b.starts_on);
  };
}

function matchesWhen(jam: MapJam, when: When, today: Date): boolean {
  if (when === "past") return isPast(jam);
  return runsIn(jam, isoRange(rangeOf(when, today)));
}

/** Time AND categories; within categories, any one is enough. */
export function matchesFilters(
  jam: MapJam,
  filters: Filters,
  today: Date,
): boolean {
  if (filters.when && !matchesWhen(jam, filters.when, today)) return false;
  return inCategories(jam, filters.categories);
}

/** Any one of `categories` is enough; none chosen lets every jam through. */
function inCategories(jam: MapJam, categories: Category[]): boolean {
  return (
    categories.length === 0 ||
    jam.categories.some((c) => categories.includes(c))
  );
}

/** The filters a `/jams` link asks for: `?when=weekend&battles=one_v_one,kids`. */
export function filtersOf(params: URLSearchParams): Filters {
  const when = WHENS.find((w) => w === params.get("when")) ?? null;
  const asked = (params.get("battles") ?? "").split(",");
  return { when, categories: CATEGORIES.filter((c) => asked.includes(c)) };
}

/** Writes `filters` into `params` the way `filtersOf` reads them; other parameters stay. */
export function writeFilters(params: URLSearchParams, filters: Filters) {
  if (filters.when) params.set("when", filters.when);
  else params.delete("when");
  if (filters.categories.length > 0)
    params.set("battles", filters.categories.join(","));
  else params.delete("battles");
}

/** A `/jams` link with these filters on. */
export function jamsLink(filters: Partial<Filters>): string {
  const params = new URLSearchParams();
  writeFilters(params, { ...NO_FILTERS, ...filters });
  // Commas read better in a link than `%2C`, and URLSearchParams reads them back as they are.
  const search = params.toString().replaceAll("%2C", ",");
  return search ? `/jams?${search}` : "/jams";
}

export function isFiltered(filters: Filters): boolean {
  return filters.when !== null || filters.categories.length > 0;
}

/** Lower case without accents, for matching what people type. */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The jams that pass the filters and a search, judged from `today`: upcoming ones unless the
 * "Past jams" filter is on or a search looks through every jam.
 */
export function narrow(
  jams: MapJam[],
  filters: Filters,
  search: string,
  language: string,
  today: Date,
): MapJam[] {
  const upcomingOnly = filters.when === null && search === "";
  return jams
    .filter(
      (jam) =>
        !(upcomingOnly && isPast(jam)) &&
        matchesFilters(jam, filters, today) &&
        matchesSearch(jam, search, language),
    )
    .sort(byDate());
}

/** What the map shows (M33): past jams with the "Past jams" chip, else the days of `range`. */
export type MapView = { past: boolean; categories: Category[]; range: Range };

export const mapViewAt = (today: Date): MapView => ({
  past: false,
  categories: [],
  range: defaultRange(isoDate(today)),
});

/**
 * The map's jams, soonest first: the past ones with "Past jams" on, else the live and upcoming
 * ones with a day in the range; a search follows the same rule (DESIGN.md §6 Map).
 */
export function onMap(
  jams: MapJam[],
  view: MapView,
  search: string,
  language: string,
): MapJam[] {
  return jams
    .filter(
      (jam) =>
        (view.past ? isPast(jam) : !isPast(jam) && runsIn(jam, view.range)) &&
        inCategories(jam, view.categories) &&
        matchesSearch(jam, search, language),
    )
    .sort(byDate());
}

/** Whether anything narrows the map beyond its default view. */
export function isNarrowed(view: MapView, today: Date): boolean {
  return (
    view.past ||
    view.categories.length > 0 ||
    !sameRange(view.range, defaultRange(isoDate(today)))
  );
}

/** The map's view in its URL: `?when=past`, `?battles=` as `/jams` has them, `?from=&to=`. */
export function mapViewOf(params: URLSearchParams, today: Date): MapView {
  const { when, categories } = filtersOf(params);
  const range = rangeFromUrl(params, isoDate(today));
  return { past: when === "past", categories, range };
}

/** Writes `view` the way `mapViewOf` reads it; other parameters stay. */
export function writeMapView(
  params: URLSearchParams,
  view: MapView,
  today: Date,
) {
  writeFilters(params, {
    when: view.past ? "past" : null,
    categories: view.categories,
  });
  writeRange(params, view.range, isoDate(today));
}

/** The map's chips as `FilterChips` shows them: "This weekend" is on while the range is it. */
export function chipsOf(view: MapView, today: Date): Filters {
  const weekend = isoRange(rangeOf("weekend", today));
  let when: When | null = null;
  if (view.past) when = "past";
  else if (sameRange(view.range, weekend)) when = "weekend";
  return { when, categories: view.categories };
}

/**
 * The view after a tap on the chips: "This weekend" sets the range to the weekend, and back to
 * the default when turned off; "Past jams" keeps the range for when it goes off again.
 */
export function withChips(view: MapView, chips: Filters, today: Date): MapView {
  const weekendBefore = chipsOf(view, today).when === "weekend";
  let range = view.range;
  if (chips.when === "weekend") range = isoRange(rangeOf("weekend", today));
  else if (weekendBefore) range = defaultRange(isoDate(today));
  return { past: chips.when === "past", categories: chips.categories, range };
}

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
  const centre = centreOf(home);
  const nearest = [...jams]
    .sort((a, b) => distanceKm(centre, a) - distanceKm(centre, b))
    .slice(0, NEAREST);
  const [west, south, east, north] = home;
  return boundsOf([
    ...nearest,
    { lng: west, lat: south },
    { lng: east, lat: north },
  ]);
}

/** The jam page's "More jams coming up": up to 4 upcoming jams other than `jam`, the nearest
 * first, or the soonest when it has no pin. */
export function otherJams(
  jams: MapJam[],
  jam: { id: string; lng?: number | null; lat?: number | null },
): MapJam[] {
  const { lng, lat } = jam;
  const others = jams.filter((j) => j.id !== jam.id && !isPast(j));
  if (lng != null && lat != null) {
    others.sort(
      (a, b) => distanceKm({ lng, lat }, a) - distanceKm({ lng, lat }, b),
    );
  } else {
    others.sort(byDate());
  }
  return others.slice(0, 4);
}

/** The middle of a box. */
export function centreOf([west, south, east, north]: Bounds) {
  return { lng: (west + east) / 2, lat: (south + north) / 2 };
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

/** A box as `/map?fit=` takes it: `west,south,east,north`, to about 10 m. */
export function fitParam(box: Bounds): string {
  return box.map((n) => n.toFixed(4)).join(",");
}

/** A number from the URL; `NaN` when absent or blank (`Number("")` would be 0). */
const urlNumber = (value: string | null) =>
  value === null || value.trim() === "" ? Number.NaN : Number(value);
const isLng = (n: number) => n >= -180 && n <= 180;
const isLat = (n: number) => n >= -90 && n <= 90;

/**
 * The first view a link asks `/map` for: `?fit=west,south,east,north` ("Open the map around
 * <Place>"), else `?lat=&lng=`; null when neither is there and well formed.
 */
export function askedView(
  params: URLSearchParams,
): { bounds: Bounds } | { lng: number; lat: number } | null {
  const fit = (params.get("fit") ?? "").split(",").map(urlNumber);
  const [west, south, east, north] = fit;
  if (
    fit.length === 4 &&
    west !== undefined &&
    south !== undefined &&
    east !== undefined &&
    north !== undefined &&
    isLng(west) &&
    isLng(east) &&
    isLat(south) &&
    isLat(north) &&
    south <= north
  )
    return { bounds: [west, south, east, north] };
  const lng = urlNumber(params.get("lng"));
  const lat = urlNumber(params.get("lat"));
  return isLng(lng) && isLat(lat) ? { lng, lat } : null;
}
