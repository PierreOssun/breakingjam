// The map's From and To dates (M33), within a year from today; pure, so tested without a slider.
// Days are `YYYY-MM-DD` calendar dates, counted in UTC so no daylight saving shift moves them.
import { formatDay } from "../../lib/dates";

/** The days a map shows, both included. */
export type Range = { from: string; to: string };

/** The presets, in months: 1 month, 3 months, 6 months, 1 year. */
export const PRESETS = [1, 3, 6, 12] as const;
export type Preset = (typeof PRESETS)[number];

const DAY_MS = 86_400_000;

function utcOf(day: string): number {
  const [year = 1970, month = 1, date = 1] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

const dayOf = (utc: number) => new Date(utc).toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  return dayOf(utcOf(day) + days * DAY_MS);
}

/** `months` later, on the month's last day when it is shorter: 31 Jan + 1 month = 28 Feb. */
export function addMonths(day: string, months: number): string {
  const date = new Date(utcOf(day));
  const target = date.getUTCMonth() + months;
  const lastOfTarget = new Date(
    Date.UTC(date.getUTCFullYear(), target + 1, 0),
  ).getUTCDate();
  return dayOf(
    Date.UTC(
      date.getUTCFullYear(),
      target,
      Math.min(date.getUTCDate(), lastOfTarget),
    ),
  );
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** The last day the slider reaches: a year from `today`. */
export const lastDay = (today: string) => addMonths(today, 12);

export const presetRange = (months: Preset, today: string): Range => ({
  from: today,
  to: addMonths(today, months),
});

/** Today to a year from today: every upcoming jam but the very far ones. */
export const defaultRange = (today: string) => presetRange(12, today);

/** A `[from, to]` pair as a range. */
export const isoRange = ([from, to]: [string, string]): Range => ({ from, to });

export const sameRange = (a: Range, b: Range) =>
  a.from === b.from && a.to === b.to;

/** The preset `range` is exactly, if any. */
export function presetOf(range: Range, today: string): Preset | null {
  return (
    PRESETS.find((months) => sameRange(range, presetRange(months, today))) ??
    null
  );
}

/** Whether two ranges share a day. */
export const meet = (a: Range, b: Range) => a.from <= b.to && a.to >= b.from;

/** Whether something running from `starts_on` to `ends_on` has a day in `range`. */
export function runsIn(
  span: { starts_on: string; ends_on: string },
  range: Range,
): boolean {
  return meet({ from: span.starts_on, to: span.ends_on }, range);
}

const clampDay = (day: string, min: string, max: string) =>
  [min, day, max].sort()[1] ?? day;

/** A well-formed day from the URL, normalised (31 Feb is 3 Mar), or null. */
function urlDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return dayOf(utcOf(value));
}

/**
 * The range a link asks for (`?from=&to=`): a From in the past is today, a To beyond a year is
 * a year, and a missing one is the default's.
 */
export function rangeFromUrl(params: URLSearchParams, today: string): Range {
  const last = lastDay(today);
  const from = clampDay(urlDay(params.get("from")) ?? today, today, last);
  const to = clampDay(urlDay(params.get("to")) ?? last, from, last);
  return { from, to };
}

/** Writes `range` the way `rangeFromUrl` reads it; nothing for the default range. */
export function writeRange(
  params: URLSearchParams,
  range: Range,
  today: string,
) {
  if (sameRange(range, defaultRange(today))) {
    params.delete("from");
    params.delete("to");
    return;
  }
  params.set("from", range.from);
  params.set("to", range.to);
}

/** The slider's 12 months, a month from today each, without the year's last day. */
export function sliderMonths(today: string): Range[] {
  return Array.from({ length: 12 }, (_, i) => ({
    from: addMonths(today, i),
    to: addDays(addMonths(today, i + 1), -1),
  }));
}

/** How many of `jams` run in each of the slider's months: the bars over it. */
export function monthCounts(
  jams: { starts_on: string; ends_on: string }[],
  today: string,
): number[] {
  return sliderMonths(today).map(
    (month) => jams.filter((jam) => runsIn(jam, month)).length,
  );
}

/** "Now" (`now`, translated) for today, else the day as `formatDay` writes it. */
export function dayLabel(
  day: string,
  today: string,
  language: string,
  now: string,
): string {
  return day === today
    ? now
    : formatDay(day, language, Number(today.slice(0, 4)));
}

/** "Now – 15 Nov 2027": the range on the pill and over the list. */
export function rangeLabel(
  { from, to }: Range,
  today: string,
  language: string,
  now: string,
): string {
  const label = (day: string) => dayLabel(day, today, language, now);
  return `${label(from)} – ${label(to)}`;
}
