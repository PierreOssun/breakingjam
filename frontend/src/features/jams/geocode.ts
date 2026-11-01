// Place search with Photon (komoot's OpenStreetMap geocoder, decided in M24): it allows
// suggestions as you type, which Nominatim's policy does not. Data © OpenStreetMap contributors.

import type { LngLat } from "../map/PinMap";

/** A place Photon found, read into what the venue block fills in. */
export type Place = {
  /** OSM type and id, for list keys. */
  id: string;
  /** What the suggestion row says first: the venue, the street or the town. */
  title: string;
  /** The rest of the row: the address, or the town and country. */
  subtitle: string | null;
  /** The venue's name, when the result is a named place rather than an address or a town. */
  name: string | null;
  /** "Wasserwerkstrasse 21, 8006 Zürich"; null for a town or a nameless area. */
  address: string | null;
  city: string | null;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string | null;
  lat: number;
  lng: number;
};

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: Partial<
    Record<
      | "osm_type"
      | "osm_key"
      | "osm_value"
      | "name"
      | "street"
      | "housenumber"
      | "postcode"
      | "city"
      | "town"
      | "village"
      | "county"
      | "country"
      | "countrycode",
      string
    >
  > & { osm_id?: number };
};

const ENDPOINT = "https://photon.komoot.io";
const SETTLEMENTS = ["city", "town", "village", "hamlet"];

/** Photon speaks our three languages; anything else falls back to English. */
const photonLang = (language: string) => {
  const lang = language.slice(0, 2);
  return ["en", "fr", "de"].includes(lang) ? lang : "en";
};

/** One result as the venue block uses it. */
export function placeOf({ geometry, properties: p }: Feature): Place {
  const [lng, lat] = geometry.coordinates;
  // Towns, streets and areas are not venues; anything else with a name is.
  const named = ["place", "highway", "boundary"].includes(p.osm_key ?? "");
  const name = p.name && !named ? p.name : null;
  const street = p.street
    ? [p.street, p.housenumber].filter(Boolean).join(" ")
    : p.osm_key === "highway"
      ? (p.name ?? null)
      : null;
  const city =
    p.city ??
    p.town ??
    p.village ??
    (p.osm_key === "place" && SETTLEMENTS.includes(p.osm_value ?? "")
      ? (p.name ?? null)
      : null);
  const town = [p.postcode, city].filter(Boolean).join(" ") || null;
  const address = street ? [street, town].filter(Boolean).join(", ") : null;
  const title = name ?? street ?? p.name ?? city ?? p.country ?? "";
  // A venue's row shows its address; an address's row its town; a town's row only its country.
  const details = name ? (address ?? town) : town !== title ? town : null;
  const subtitle = [details, p.country].filter(Boolean).join(", ");
  return {
    id: `${p.osm_type ?? ""}${p.osm_id ?? ""}`,
    title,
    subtitle: subtitle || null,
    name,
    address,
    city,
    country: p.countrycode?.toUpperCase() ?? null,
    lat,
    lng,
  };
}

/** Up to five places for what was typed, nearer ones first when there is a pin to go by. */
export async function search(
  query: string,
  {
    language,
    near,
    signal,
  }: { language: string; near?: LngLat | null; signal?: AbortSignal },
): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    limit: "5",
    lang: photonLang(language),
  });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const response = await fetch(`${ENDPOINT}/api/?${params}`, { signal });
  if (!response.ok) throw new Error(`geocode: ${response.status}`);
  const { features } = (await response.json()) as { features: Feature[] };
  return features.map(placeOf);
}

/** What is at a point, for a pin dropped before any search; null in the middle of nowhere. */
export async function reverse(
  point: LngLat,
  { language, signal }: { language: string; signal?: AbortSignal },
): Promise<Place | null> {
  const params = new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lng),
    lang: photonLang(language),
  });
  const response = await fetch(`${ENDPOINT}/reverse?${params}`, { signal });
  if (!response.ok) throw new Error(`geocode: ${response.status}`);
  const { features } = (await response.json()) as { features: Feature[] };
  return features[0] ? placeOf(features[0]) : null;
}
