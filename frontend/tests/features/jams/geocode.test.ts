import { placeOf, reverse, search } from "../../../src/features/jams/geocode";

/** A Photon result; the coordinates are `[lng, lat]`, as GeoJSON has them. */
const feature = (
  properties: object,
  coordinates: [number, number] = [8.5417, 47.3769],
) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties: { osm_type: "N", osm_id: 123, ...properties },
});

const DYNAMO = feature({
  osm_key: "amenity",
  osm_value: "community_centre",
  name: "Dynamo Jugendkulturhaus",
  street: "Wasserwerkstrasse",
  housenumber: "21",
  postcode: "8006",
  city: "Zürich",
  country: "Schweiz",
  countrycode: "CH",
});

describe("the place search", () => {
  it("asks Photon as you type, in the UI language, near the pin", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ type: "FeatureCollection", features: [DYNAMO] }),
    );
    vi.stubGlobal("fetch", fetch);

    const places = await search("Dynamo", {
      language: "de",
      near: { lat: 47.38, lng: 8.54 },
    });

    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "Dynamo",
      limit: "5",
      lang: "de",
      lat: "47.38",
      lon: "8.54",
    });
    expect(places).toEqual([
      {
        id: "N123",
        title: "Dynamo Jugendkulturhaus",
        subtitle: "Wasserwerkstrasse 21, 8006 Zürich, Schweiz",
        name: "Dynamo Jugendkulturhaus",
        address: "Wasserwerkstrasse 21, 8006 Zürich",
        city: "Zürich",
        country: "CH",
        lat: 47.3769,
        lng: 8.5417,
      },
    ]);
  });

  it("speaks Photon's languages only, and searches without a pin", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ type: "FeatureCollection", features: [] }),
    );
    vi.stubGlobal("fetch", fetch);
    await search("Dynamo", { language: "it-IT" });
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "Dynamo",
      limit: "5",
      lang: "en",
    });
  });

  it("reads an address, a street and a town as what they are", () => {
    const house = placeOf(
      feature({
        osm_key: "building",
        osm_value: "yes",
        street: "Rue des Arts",
        housenumber: "12",
        postcode: "75003",
        city: "Paris",
        country: "France",
        countrycode: "FR",
      }),
    );
    expect(house).toMatchObject({
      title: "Rue des Arts 12",
      subtitle: "75003 Paris, France",
      name: null,
      address: "Rue des Arts 12, 75003 Paris",
      city: "Paris",
      country: "FR",
    });

    const street = placeOf(
      feature({
        osm_key: "highway",
        osm_value: "residential",
        name: "Rue des Arts",
        postcode: "75003",
        city: "Paris",
        country: "France",
        countrycode: "FR",
      }),
    );
    expect(street).toMatchObject({
      title: "Rue des Arts",
      subtitle: "75003 Paris, France",
      name: null,
      address: "Rue des Arts, 75003 Paris",
      city: "Paris",
    });

    const village = placeOf(
      feature({
        osm_key: "place",
        osm_value: "village",
        name: "Saint-Égrève",
        country: "France",
        countrycode: "FR",
      }),
    );
    expect(village).toMatchObject({
      title: "Saint-Égrève",
      subtitle: "France",
      name: null,
      address: null,
      city: "Saint-Égrève",
      country: "FR",
    });
  });

  it("names what is under a dropped pin, or nothing", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ type: "FeatureCollection", features: [DYNAMO] }),
    );
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const found = await reverse(
      { lat: 47.3769, lng: 8.5417 },
      { language: "fr", signal: controller.signal },
    );
    const [, init] = fetch.mock.calls[0] as unknown[];
    expect(init).toEqual({ signal: controller.signal });
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/reverse");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lat: "47.3769",
      lon: "8.5417",
      lang: "fr",
    });
    expect(found).toMatchObject({ city: "Zürich", country: "CH" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ type: "FeatureCollection", features: [] }),
      ),
    );
    expect(await reverse({ lat: 0, lng: 0 }, { language: "en" })).toBeNull();
  });

  it("fails loudly when Photon does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("slow down", { status: 429 })),
    );
    await expect(search("Paris", { language: "en" })).rejects.toThrow("429");
  });
});
