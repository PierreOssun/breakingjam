import { geocode } from "../../../src/features/jams/geocode";

describe("geocode", () => {
  it("asks Nominatim once, in the UI language and the jam's country", async () => {
    const fetch = vi.fn(async () =>
      Response.json([
        {
          lat: "48.8566",
          lon: "2.3522",
          display_name: "12, Rue des Arts, Paris, France",
          address: { city: "Paris", country_code: "fr" },
        },
        {
          lat: "45.1",
          lon: "5.7",
          display_name: "Rue des Arts, Saint-Égrève, France",
          address: { town: "Saint-Égrève", country_code: "fr" },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetch);

    const places = await geocode("12 Rue des Arts, Paris", {
      language: "fr",
      country: "FR",
    });

    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe(
      "https://nominatim.openstreetmap.org/search",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "12 Rue des Arts, Paris",
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
      "accept-language": "fr",
      countrycodes: "fr",
    });
    expect(places).toEqual([
      {
        label: "12, Rue des Arts, Paris, France",
        lat: 48.8566,
        lng: 2.3522,
        city: "Paris",
        country: "FR",
      },
      {
        label: "Rue des Arts, Saint-Égrève, France",
        lat: 45.1,
        lng: 5.7,
        city: "Saint-Égrève",
        country: "FR",
      },
    ]);
  });

  it("fails loudly when Nominatim does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("slow down", { status: 429 })),
    );
    await expect(geocode("Paris", { language: "en" })).rejects.toThrow("429");
  });
});
