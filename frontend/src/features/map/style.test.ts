import { mapStyle, tileSource } from "./style";

describe("map style", () => {
  const source = tileSource({ key: "public-key" });

  it("uses the hosted tiles with the key, or the self-hosted extract", () => {
    expect(source.tiles?.[0]).toBe(
      "https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=public-key",
    );
    expect(source.attribution).toMatch(/Protomaps.+OpenStreetMap/);
    const own = tileSource({
      tilesUrl: "pmtiles://https://tiles.breakingjam.com/world.pmtiles",
      key: "x",
    });
    expect(own.url).toBe(
      "pmtiles://https://tiles.breakingjam.com/world.pmtiles",
    );
    expect(own.tiles).toBeUndefined();
  });

  it("needs no sprite: no layer draws an icon", () => {
    const style = mapStyle("dark", "en", source);
    expect(style.sprite).toBeUndefined();
    expect(
      style.layers.some(
        (l) => "layout" in l && l.layout && "icon-image" in l.layout,
      ),
    ).toBe(false);
    // City names survive; only their dots are gone.
    expect(style.layers.find((l) => l.id === "places_locality")).toBeDefined();
  });

  it("shows road labels from zoom 13 only", () => {
    const roadLabels = mapStyle("dark", "en", source).layers.filter((l) =>
      l.id.startsWith("roads_labels"),
    );
    expect(roadLabels.length).toBeGreaterThan(0);
    expect(roadLabels.every((l) => (l.minzoom ?? 0) >= 13)).toBe(true);
  });

  it("paints DESIGN.md §7's land and water in each theme", () => {
    const paint = (theme: "dark" | "light", id: string) =>
      JSON.stringify(
        mapStyle(theme, "en", source).layers.find((l) => l.id === id),
      );
    expect(paint("dark", "earth")).toContain("#0E111A");
    expect(paint("dark", "water")).toContain("#0C1A3D");
    expect(paint("light", "earth")).toContain("#F4F6FB");
    expect(paint("light", "water")).toContain("#CCD9F5");
  });
});
