// "Near <Place>" on the search page (DESIGN.md §4.33): which jams it lists and how it frames
// them. Pure, so it is tested without a page.
import type { Schemas } from "../../api/client";
import { localeOf } from "../../lib/dates";
import {
  type Bounds,
  boundsOf,
  distanceKm,
  fold,
  isPast,
  type MapJam,
} from "../map/jams";

export type Place = Schemas["Place"];

/** Farther than this, a jam isn't near. */
export const NEAR_KM = 500;
/** How many jams the card lists. */
const LISTED = 3;
/** A jam this close counts as in the place, whatever its city is called. */
const IN_PLACE_KM = 15;

/** The nearest upcoming jams within 500 km, nearest first, with their distance. */
export function nearestTo(place: Place, jams: MapJam[], today: Date) {
  return jams
    .filter((jam) => !isPast(jam, today))
    .map((jam) => ({ jam, km: distanceKm(place, jam) }))
    .filter(({ km }) => km <= NEAR_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, LISTED);
}

/** Whether an upcoming jam is in the place itself: its city has the place's name, or it is
 * within 15 km. */
export function hasJamIn(place: Place, jams: MapJam[], today: Date): boolean {
  const name = fold(place.name);
  return jams.some(
    (jam) =>
      !isPast(jam, today) &&
      ((jam.country === place.country && fold(jam.city) === name) ||
        distanceKm(place, jam) <= IN_PLACE_KM),
  );
}

/** `/map` framed on the place and the jams listed under it. */
export function mapLink(place: Place, jams: MapJam[]): string {
  const box: Bounds = boundsOf([place, ...jams]) ?? [
    place.lng,
    place.lat,
    place.lng,
    place.lat,
  ];
  const fit = box.map((n) => n.toFixed(4)).join(",");
  return `/map?lat=${place.lat}&lng=${place.lng}&fit=${fit}`;
}

/** "100 km", rounded to the kilometre. */
export function formatKm(km: number, language: string): string {
  return new Intl.NumberFormat(localeOf(language), {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: 0,
  }).format(km);
}
