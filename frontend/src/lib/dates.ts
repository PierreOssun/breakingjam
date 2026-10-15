// Jam dates are calendar dates in the jam's own timezone (§4); they are formatted as UTC
// so no viewer timezone can move them to the day before.

const LOCALES: Record<string, string> = {
  en: "en-GB",
  fr: "fr-FR",
  de: "de-DE",
};

/** BCP 47 locale for a UI language. */
export function localeOf(language: string): string {
  return LOCALES[language] ?? "en-GB";
}

/** `"2026-11-14"` as a Date at UTC midnight. */
export function calendarDate(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Saturday 14 November 2026", or a range when the jam lasts several days. */
export function formatDateRange(
  startsOn: string,
  endsOn: string,
  language: string,
): string {
  const format = new Intl.DateTimeFormat(localeOf(language), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return startsOn === endsOn
    ? format.format(calendarDate(startsOn))
    : format.formatRange(calendarDate(startsOn), calendarDate(endsOn));
}

/** Day of the month and short month without dots, for date blocks: `{ day: "14", month: "Nov" }`. */
export function dayAndMonth(
  iso: string,
  language: string,
): { day: string; month: string } {
  const date = calendarDate(iso);
  const month = new Intl.DateTimeFormat(localeOf(language), {
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
  return { day: String(date.getUTCDate()), month };
}

/** The calendar year of a date. */
export function yearOf(iso: string): number {
  return calendarDate(iso).getUTCFullYear();
}
