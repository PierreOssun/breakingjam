import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import type {
  LayerSpecification,
  StyleSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";

const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';
const GLYPHS =
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

// Layers that draw icons from a sprite. DESIGN.md §7's map has none of them (no POIs, shields
// or one-way arrows), and leaving them out means there is no sprite to load.
const ICON_LAYERS = new Set(["pois", "roads_shields", "roads_oneway"]);

/** A layer without its `icon-*` layout properties: city names stay, their town dots go. */
function withoutIcons(layer: LayerSpecification): LayerSpecification {
  if (!("layout" in layer) || !layer.layout || !("icon-image" in layer.layout))
    return layer;
  const layout = Object.fromEntries(
    Object.entries(layer.layout).filter(([key]) => !key.startsWith("icon-")),
  );
  return { ...layer, layout } as LayerSpecification;
}

function labels(color: string, halo: string): Partial<Flavor> {
  return {
    roads_label_minor: color,
    roads_label_minor_halo: halo,
    roads_label_major: color,
    roads_label_major_halo: halo,
    ocean_label: color,
    subplace_label: color,
    subplace_label_halo: halo,
    city_label: color,
    city_label_halo: halo,
    state_label: color,
    state_label_halo: halo,
    country_label: color,
    address_label: color,
    address_label_halo: halo,
  };
}

// DESIGN.md §7. Labels are the `muted` token on a `bg` halo of each theme.
const DARK: Partial<Flavor> = {
  background: "#0E111A",
  earth: "#0E111A",
  water: "#0C1A3D",
  park_a: "#131B24",
  park_b: "#131B24",
  other: "#1A1F2E",
  minor_service: "#1A1F2E",
  minor_a: "#1A1F2E",
  minor_b: "#1A1F2E",
  link: "#1A1F2E",
  major: "#2A3147",
  highway: "#2A3147",
  ...labels("#A3AAC2", "#0B0D14"),
};

const LIGHT: Partial<Flavor> = {
  background: "#F4F6FB",
  earth: "#F4F6FB",
  water: "#CCD9F5",
  other: "#FFFFFF",
  minor_service: "#FFFFFF",
  minor_a: "#FFFFFF",
  minor_b: "#FFFFFF",
  link: "#FFFFFF",
  major: "#FFFFFF",
  highway: "#FFFFFF",
  minor_service_casing: "#D7DCE8",
  minor_casing: "#D7DCE8",
  link_casing: "#D7DCE8",
  major_casing_early: "#D7DCE8",
  major_casing_late: "#D7DCE8",
  highway_casing_early: "#D7DCE8",
  highway_casing_late: "#D7DCE8",
  ...labels("#555D75", "#F4F6FB"),
};

/**
 * Vector tiles: a self-hosted `pmtiles://` extract when `VITE_TILES_URL` is set, else the
 * hosted Protomaps API with the public, origin-restricted key (§6 Map).
 */
export function tileSource(env: {
  tilesUrl?: string;
  key?: string;
}): VectorSourceSpecification {
  if (env.tilesUrl)
    return { type: "vector", url: env.tilesUrl, attribution: ATTRIBUTION };
  return {
    type: "vector",
    tiles: [
      `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=${env.key ?? ""}`,
    ],
    maxzoom: 15,
    attribution: ATTRIBUTION,
  };
}

/** The base map in the page's theme, with labels in the UI language. */
export function mapStyle(
  theme: "dark" | "light",
  language: string,
  source: VectorSourceSpecification,
): StyleSpecification {
  const flavor = {
    ...namedFlavor(theme),
    ...(theme === "dark" ? DARK : LIGHT),
  };
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { protomaps: source },
    layers: layers("protomaps", flavor, { lang: language })
      .filter((layer) => !ICON_LAYERS.has(layer.id))
      .map(withoutIcons)
      // §7: road labels only from zoom 13.
      .map((layer) =>
        layer.id.startsWith("roads_labels")
          ? { ...layer, minzoom: Math.max(layer.minzoom ?? 0, 13) }
          : layer,
      ),
  };
}
