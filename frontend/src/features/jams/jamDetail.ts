// What the jam page derives from a jam (DESIGN.md §6 Jam detail): its countdown, its primary
// action, the prizes, who is in. Pure, so it is tested without a page.
import type { Schemas } from "../../api/client";
import { formatShortDateRange, localeOf } from "../../lib/dates";

type Jam = Schemas["Event"];

/** Where the jam is from now: "In 9 days", "Tomorrow", "Today", "Live now". */
export type Countdown =
  { key: "days"; count: number } | { key: "tomorrow" | "today" | "live" };

/** The jam's own date and time now, as `YYYY-MM-DD` and `HH:MM`. */
function wallClock(now: Date, timeZone: string): { day: string; time: string } {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    // An unknown zone name: UTC is at most a day off.
    parts = format("UTC");
  }
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * The countdown chip, in the jam's timezone: live once its first battle has started (or from its
 * second day when no start is announced); none once it's over, completed or cancelled.
 */
export function countdown(
  jam: Pick<Jam, "status" | "starts_on" | "ends_on" | "timezone">,
  firstStart: string | null,
  now: Date,
): Countdown | null {
  if (jam.status === "completed" || jam.status === "cancelled") return null;
  const { day, time } = wallClock(now, jam.timezone);
  if (day > jam.ends_on) return null;
  if (day < jam.starts_on) {
    const days = daysBetween(day, jam.starts_on);
    return days === 1 ? { key: "tomorrow" } : { key: "days", count: days };
  }
  const started =
    day > jam.starts_on ||
    (firstStart !== null && `${day}T${time}` >= firstStart.slice(0, 16));
  return { key: started ? "live" : "today" };
}

/** The earliest announced battle start, a wall-clock `YYYY-MM-DDTHH:MM:SS`, if any. */
export function firstStart(battles: Schemas["Battle"][]): string | null {
  const starts = battles.flatMap((b) => (b.starts_at ? [b.starts_at] : []));
  return starts.sort()[0] ?? null;
}

/** The action bar's and action card's primary button (§4.32); none for a cancelled jam. */
export type PrimaryAction = "register" | "calendar" | "results";

export function primaryAction(
  jam: Pick<Jam, "status" | "registration_url">,
): PrimaryAction | null {
  switch (jam.status) {
    case "cancelled":
      return null;
    case "completed":
      return "results";
    case "registration_closed":
      return "calendar";
    default:
      // Published (and drafts, as their organiser previews them): register where they can.
      return jam.registration_url ? "register" : "calendar";
  }
}

/** The action card's caption, as an i18n key under `jam.caption`; none once it took place. */
export function actionCaption(
  jam: Pick<Jam, "status" | "registration_url">,
): "open" | "closed" | "spectators" | "cancelled" | null {
  switch (primaryAction(jam)) {
    case "register":
      return "open";
    case "calendar":
      return jam.status === "registration_closed" ? "closed" : "spectators";
    case "results":
      return null;
    case null:
      return "cancelled";
  }
}

/** All cash prizes together, per currency: "€1,750", or "CHF 1,000 + €500"; null without any. */
export function totalPrizes(
  battles: Schemas["Battle"][],
  language: string,
): string | null {
  const sums = new Map<string, number>();
  for (const b of battles) {
    if (!b.prize_currency) continue;
    const total =
      (b.prize_first ?? 0) + (b.prize_second ?? 0) + (b.prize_third ?? 0);
    sums.set(b.prize_currency, (sums.get(b.prize_currency) ?? 0) + total);
  }
  const amounts = [...sums]
    .filter(([, total]) => total > 0)
    .map(([currency, total]) =>
      new Intl.NumberFormat(localeOf(language), {
        style: "currency",
        currency,
        // Both, as in `prizeLine`: older engines throw on a maximum below the currency's minimum.
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(total),
    );
  return amounts.length > 0 ? amounts.join(" + ") : null;
}

/** Who is listed: the competitors of entries still in, without repeats, then the lineup by role. */
export function whoIsIn(
  entries: Schemas["Entry"][],
  staff: Schemas["StaffMember"][],
) {
  const dancers = new Map<string, Schemas["DancerRef"]>();
  for (const entry of entries) {
    if (entry.status === "withdrawn") continue;
    for (const member of entry.members) dancers.set(member.id, member);
  }
  const role = (r: Schemas["StaffRole"]) =>
    staff.filter((s) => s.role === r).map((s) => s.dancer);
  // A dancer may hold several roles (judge and MC): one face each.
  const people = new Map(staff.map((s) => [s.dancer.id, s.dancer]));
  return {
    dancers: [...dancers.values()],
    judges: role("judge"),
    djs: role("dj"),
    mcs: role("mc"),
    staff: [...people.values()],
  };
}

/** "Paris Cypher · Sat 14 Nov · Paris": what Share sends, as the link preview titles it. */
export function shareTitle(
  jam: Pick<Jam, "name" | "starts_on" | "ends_on" | "city">,
  language: string,
): string {
  const dates = formatShortDateRange(jam.starts_on, jam.ends_on, language);
  return `${jam.name} · ${dates} · ${jam.city}`;
}

/** Directions to the venue in Apple Maps (Apple devices) or Google Maps (the rest). */
export function directionsUrl(
  point: { lat: number; lng: number },
  maps: "apple" | "google",
): string {
  const at = `${point.lat},${point.lng}`;
  return maps === "apple"
    ? `https://maps.apple.com/?daddr=${at}`
    : `https://www.google.com/maps/dir/?api=1&destination=${at}`;
}

/** "Floor Lords e.V." → "FL": the organiser card's avatar while organisers have no logo. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  const initials = words
    .slice(0, 2)
    .map((word) => [...word.replace(/[^\p{L}\p{N}]/gu, "")][0] ?? "")
    .join("")
    .toUpperCase();
  return initials || "?";
}
