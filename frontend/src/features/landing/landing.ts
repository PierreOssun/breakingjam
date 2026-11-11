// What the landing page derives from the jams: where "near you" is, the next jams there and the
// cards' countdowns. Pure, so it is tested without a page.
import { daysBetween, type Countdown } from "../jams/jamDetail";
import { COUNTRY_BOUNDS } from "../map/countryBounds";
import {
  centreOf,
  distanceKm,
  isoDate,
  isPast,
  type MapJam,
} from "../map/jams";
import { NEAR_KM } from "../places/near";

type Point = { lng: number; lat: number };

/** How many cards "Next up near you" shows. */
export const NEXT_UP = 4;

/** Where "near you" is measured from: the position the visitor shares, else their country's
 * centre; null when neither is known. */
export function referencePoint(
  position: Point | null,
  country: string | null,
): Point | null {
  if (position) return position;
  const box = country ? COUNTRY_BOUNDS[country] : undefined;
  return box ? centreOf(box) : null;
}

const upcoming = (jams: MapJam[]) => jams.filter((jam) => !isPast(jam));
const soonestFirst = (a: MapJam, b: MapJam) =>
  a.starts_on.localeCompare(b.starts_on) || a.name.localeCompare(b.name);
const nearestTo = (from: Point) => (a: MapJam, b: MapJam) =>
  distanceKm(from, a) - distanceKm(from, b);
const isNear = (from: Point) => (jam: MapJam) =>
  distanceKm(from, jam) <= NEAR_KM;

/**
 * "Next up near you", soonest first: the soonest jams near `from`, topped up with the nearest
 * others when fewer are near; the soonest anywhere without a point.
 */
export function nextUp(jams: MapJam[], from: Point | null): MapJam[] {
  const next = upcoming(jams).sort(soonestFirst);
  if (!from) return next.slice(0, NEXT_UP);
  const near = next.filter(isNear(from)).slice(0, NEXT_UP);
  const others = next
    .filter((jam) => !near.includes(jam))
    .sort(nearestTo(from));
  return [...near, ...others].slice(0, NEXT_UP).sort(soonestFirst);
}

/** A card's countdown from the visitor's `today`: live, today, tomorrow, days under three
 * weeks, then whole weeks. */
export function cardCountdown(
  jam: Pick<MapJam, "phase" | "starts_on">,
  today: Date,
): Countdown {
  if (jam.phase === "live") return { key: "live" };
  const days = daysBetween(isoDate(today), jam.starts_on);
  if (days <= 0) return { key: "today" };
  if (days === 1) return { key: "tomorrow" };
  if (days < 21) return { key: "days", count: days };
  return { key: "weeks", count: Math.floor(days / 7) };
}
