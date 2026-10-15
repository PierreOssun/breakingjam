// MapLibre, set up once for every map in the app: worker, pmtiles protocol and base style.
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibre from "maplibre-gl";
// Self-contained; as a `?url` asset Vite serves it in dev and emits it in the build.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { mapStyle, tileSource } from "./style";

// MapLibre finds its worker next to its own module, which Vite moves (pre-bundling in dev,
// hashed chunks in the build); without this the map never draws.
maplibre.setWorkerUrl(workerUrl);
if (import.meta.env.VITE_TILES_URL?.startsWith("pmtiles://")) {
  maplibre.addProtocol("pmtiles", new Protocol().tile);
}

const TILES = tileSource({
  tilesUrl: import.meta.env.VITE_TILES_URL,
  key: import.meta.env.VITE_PROTOMAPS_KEY,
});

export { maplibre };

/** The page's colour scheme: an explicit `data-theme`, else the OS setting (§2.1). */
function useTheme(): "dark" | "light" {
  const osLight = useMediaQuery("(prefers-color-scheme: light)");
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark" || chosen === "light") return chosen;
  return osLight ? "light" : "dark";
}

/** The base map in the page's theme and UI language. */
export function useMapStyle() {
  const { i18n } = useTranslation();
  const theme = useTheme();
  return useMemo(
    () => mapStyle(theme, i18n.resolvedLanguage ?? "en", TILES),
    [theme, i18n.resolvedLanguage],
  );
}
