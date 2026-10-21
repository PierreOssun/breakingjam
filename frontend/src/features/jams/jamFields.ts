// The jam form's values and the API body they become; pure, so tested without a form.
import type { Schemas } from "../../api/client";

/** What the jam form edits: text fields as typed, the pin as numbers. */
export type JamFormValues = {
  name: string;
  starts_on: string;
  ends_on: string;
  timezone: string;
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

/** The browser's timezone: the organiser is usually where the jam is. */
function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** An empty form; the timezone starts as the browser's. */
export function emptyJam(): JamFormValues {
  return {
    name: "",
    starts_on: "",
    ends_on: "",
    timezone: localTimezone(),
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

/** The form filled with a stored jam. */
export function jamValues(jam: Schemas["Event"]): JamFormValues {
  return {
    name: jam.name,
    starts_on: jam.starts_on,
    ends_on: jam.ends_on,
    timezone: jam.timezone,
    venue_name: jam.venue_name ?? "",
    address: jam.address ?? "",
    city: jam.city,
    country: jam.country,
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

/** The API body: trimmed, blanks as null. */
export function jamBody(values: JamFormValues): Schemas["EventFields"] {
  return {
    name: values.name.trim(),
    starts_on: values.starts_on,
    ends_on: values.ends_on,
    timezone: values.timezone,
    venue_name: orNull(values.venue_name),
    address: orNull(values.address),
    city: values.city.trim(),
    country: values.country,
    lat: values.lat,
    lng: values.lng,
    description: orNull(values.description),
    registration_url: orNull(values.registration_url),
    instagram_url: orNull(values.instagram_url),
    website_url: orNull(values.website_url),
    contact_email: orNull(values.contact_email),
  };
}

/** Every IANA timezone the browser knows, with `current` kept even if it doesn't. */
export function timezones(current: string): string[] {
  const all = Intl.supportedValuesOf("timeZone");
  return all.includes(current) ? all : [current, ...all];
}
