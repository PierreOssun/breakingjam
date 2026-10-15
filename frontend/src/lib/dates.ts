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

const STYLES = {
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  short: { weekday: "short", day: "numeric", month: "short" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The formatter of a style and language, built once: creating one is the slow part of Intl. */
function formatter(
  style: keyof typeof STYLES,
  language: string,
): Intl.DateTimeFormat {
  const locale = localeOf(language);
  const key = `${style}:${locale}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      ...STYLES[style],
      timeZone: "UTC",
    });
    formatters.set(key, format);
  }
  return format;
}

function range(
  style: keyof typeof STYLES,
  startsOn: string,
  endsOn: string,
  language: string,
): string {
  const format = formatter(style, language);
  return startsOn === endsOn
    ? format.format(calendarDate(startsOn))
    : format.formatRange(calendarDate(startsOn), calendarDate(endsOn));
}

/** "Saturday 14 November 2026", or a range when the jam lasts several days. */
export function formatDateRange(
  startsOn: string,
  endsOn: string,
  language: string,
): string {
  return range("long", startsOn, endsOn, language);
}

/** "Sat 14 Nov", or "Sat 14 – Sun 15 Nov": the date label of cards and popups. */
export function formatShortDateRange(
  startsOn: string,
  endsOn: string,
  language: string,
): string {
  return range("short", startsOn, endsOn, language);
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
