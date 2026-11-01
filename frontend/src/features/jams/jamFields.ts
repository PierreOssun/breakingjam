// The jam editor's values, the API body they become and the publish checklist; pure, so
// tested without a page.
import type { TFunction } from "i18next";
import { z } from "zod";
import type { Schemas } from "../../api/client";

type Jam = Schemas["Event"];

/** What the editor edits: text fields as typed, the pin as numbers, blanks for what is unset. */
export type JamFormValues = {
  name: string;
  starts_on: string;
  /** Blank for a one-day jam: `ends_on` then follows `starts_on`. */
  ends_on: string;
  timezone: string;
  /** `HH:MM`; blank = not announced. */
  opens_at: string;
  closes_at: string;
  venue_name: string;
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  description: string;
  registration_url: string;
  instagram_url: string;
  website_url: string;
  contact_email: string;
};

export type JamField = keyof JamFormValues;
export type TextField = Exclude<JamField, "lat" | "lng">;

/** The blocks that open and close; battles are always editable. */
export type Block = "dates" | "venue" | "lineup" | "about" | "links";

/** Where a field is edited: a block, or the title. */
export type Spot = Block | "title";

const SPOT_OF: Record<JamField, Spot> = {
  name: "title",
  starts_on: "dates",
  ends_on: "dates",
  timezone: "dates",
  opens_at: "dates",
  closes_at: "dates",
  venue_name: "venue",
  address: "venue",
  city: "venue",
  country: "venue",
  lat: "venue",
  lng: "venue",
  description: "about",
  registration_url: "links",
  instagram_url: "links",
  website_url: "links",
  contact_email: "links",
};

/** Every field the editor sends, in page order. */
export const JAM_FIELDS = Object.keys(SPOT_OF) as JamField[];

/** What is wrong with the jam, by field, plus `root` for what concerns all of it. */
export type SaveErrors = Partial<Record<JamField | "root", string>>;

/** Where the first problem is edited, to lead the organiser there. */
export function brokenSpot(errors: SaveErrors): Spot | null {
  const field = JAM_FIELDS.find((name) => errors[name]);
  return field ? SPOT_OF[field] : null;
}

const MAX_LENGTHS: [TextField, number][] = [
  ["name", 200],
  ["description", 200],
  ["venue_name", 200],
  ["address", 500],
  ["city", 100],
  ["registration_url", 500],
  ["instagram_url", 500],
  ["website_url", 500],
  ["contact_email", 254],
];
const LINKS: TextField[] = ["registration_url", "instagram_url", "website_url"];

/**
 * Mirrors `EventFields` in the API, which stays authoritative (§6 Forms). `kept` is the stored
 * jam when it is past draft: a city and country it has must stay.
 */
export function jamProblems(
  values: JamFormValues,
  t: TFunction,
  kept?: JamFormValues,
): SaveErrors {
  const problems: SaveErrors = {};
  const required = t("validation.required");
  for (const [field, max] of MAX_LENGTHS) {
    if (values[field].trim().length > max)
      problems[field] = t("validation.tooLong", { max });
  }
  for (const field of LINKS) {
    const link = values[field].trim();
    if (link && !/^https?:\/\/\S+$/.test(link))
      problems[field] = t("validation.url");
  }
  const email = values.contact_email.trim();
  if (email && !z.email().safeParse(email).success)
    problems.contact_email = t("validation.email");
  if (!values.name.trim()) problems.name = required;
  if (!values.starts_on) problems.starts_on = required;
  if (values.ends_on && values.ends_on < values.starts_on)
    problems.ends_on = t("validation.endsBeforeStarts");
  for (const field of ["city", "country"] as const) {
    if (kept?.[field] && !values[field].trim()) problems[field] = required;
  }
  return problems;
}

/** `values` with each field that has a problem back at what is stored, so the rest can save. */
export function withheld(
  values: JamFormValues,
  stored: JamFormValues,
  problems: SaveErrors,
): JamFormValues {
  const fields = Object.keys(problems) as JamField[];
  return {
    ...values,
    ...Object.fromEntries(fields.map((name) => [name, stored[name]])),
  };
}

/** The browser's timezone: the organiser is usually where the jam is. */
function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** An empty jam; the timezone starts as the browser's. */
export function emptyJam(): JamFormValues {
  return {
    name: "",
    starts_on: "",
    ends_on: "",
    timezone: localTimezone(),
    opens_at: "",
    closes_at: "",
    venue_name: "",
    address: "",
    city: "",
    country: "",
    lat: null,
    lng: null,
    description: "",
    registration_url: "",
    instagram_url: "",
    website_url: "",
    contact_email: "",
  };
}

/** What the start sheet sends: a name and a first day; the rest is filled in on the jam page. */
export function startBody(
  name: string,
  firstDay: string,
): Schemas["EventFields"] {
  return jamBody({ ...emptyJam(), name, starts_on: firstDay });
}

/** `HH:MM:SS` from the API as the `HH:MM` of a time input. */
const clock = (time: string | null | undefined) => time?.slice(0, 5) ?? "";

/** The editor filled with a stored jam; a one-day jam has a blank last day. */
export function jamValues(jam: Jam): JamFormValues {
  return {
    name: jam.name,
    starts_on: jam.starts_on,
    ends_on: jam.ends_on === jam.starts_on ? "" : jam.ends_on,
    timezone: jam.timezone,
    opens_at: clock(jam.opens_at),
    closes_at: clock(jam.closes_at),
    venue_name: jam.venue_name ?? "",
    address: jam.address ?? "",
    city: jam.city ?? "",
    country: jam.country ?? "",
    lat: jam.lat ?? null,
    lng: jam.lng ?? null,
    description: jam.description ?? "",
    registration_url: jam.registration_url ?? "",
    instagram_url: jam.instagram_url ?? "",
    website_url: jam.website_url ?? "",
    contact_email: jam.contact_email ?? "",
  };
}

const orNull = (value: string) => value.trim() || null;

/** The API body: trimmed, blanks as null, a blank last day as the first. */
export function jamBody(values: JamFormValues): Schemas["EventFields"] {
  return {
    name: values.name.trim(),
    starts_on: values.starts_on,
    ends_on: values.ends_on || values.starts_on,
    timezone: values.timezone,
    opens_at: orNull(values.opens_at),
    closes_at: orNull(values.closes_at),
    venue_name: orNull(values.venue_name),
    address: orNull(values.address),
    city: orNull(values.city),
    country: values.country || null,
    lat: values.lat,
    lng: values.lng,
    description: orNull(values.description),
    registration_url: orNull(values.registration_url),
    instagram_url: orNull(values.instagram_url),
    website_url: orNull(values.website_url),
    contact_email: orNull(values.contact_email),
  };
}

/** Whether two editor states send the same jam. */
export const sameJam = (a: JamFormValues, b: JamFormValues) =>
  JSON.stringify(jamBody(a)) === JSON.stringify(jamBody(b));

/** Every IANA timezone the browser knows, with `current` kept even if it doesn't. */
export function timezones(current: string): string[] {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
}

/** One line of the publish checklist; `block` is where a missing one gets filled in. */
export type ChecklistItem = {
  key: "name" | "dates" | "place" | "battle";
  done: boolean;
  block?: "venue" | "battles";
};

/** The publish checklist (M24), as the API checks it: name and dates always exist, the venue
 * needs a city, country and pin, and there must be a battle. */
export function checklist(
  jam: Pick<Jam, "city" | "country" | "lat" | "lng">,
  battles: number,
): ChecklistItem[] {
  const placed = Boolean(
    jam.city && jam.country && jam.lat != null && jam.lng != null,
  );
  return [
    { key: "name", done: true },
    { key: "dates", done: true },
    { key: "place", done: placed, block: "venue" },
    { key: "battle", done: battles > 0, block: "battles" },
  ];
}
