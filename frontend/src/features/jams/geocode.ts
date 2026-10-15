// Address search with OpenStreetMap's Nominatim (decided in M12). Its usage policy allows a
// search on an explicit action, never autocomplete, at most one per second, with attribution.

/** A place found for an address. */
export type Place = {
  label: string;
  lat: number;
  lng: number;
  /** City, town or village, when Nominatim knows it. */
  city: string | null;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string | null;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: Partial<
    Record<
      "city" | "town" | "village" | "municipality" | "country_code",
      string
    >
  >;
};

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** Up to five places for `query`, best first; `country` narrows the search when set. */
export async function geocode(
  query: string,
  { language, country }: { language: string; country?: string },
): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    "accept-language": language,
  });
  if (country) params.set("countrycodes", country.toLowerCase());
  const response = await fetch(`${ENDPOINT}?${params}`);
  if (!response.ok) throw new Error(`geocode: ${response.status}`);
  const results = (await response.json()) as NominatimResult[];
  return results.map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    city:
      r.address?.city ??
      r.address?.town ??
      r.address?.village ??
      r.address?.municipality ??
      null,
    country: r.address?.country_code?.toUpperCase() ?? null,
  }));
}
