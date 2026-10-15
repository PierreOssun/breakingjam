// What the map component computes from MapLibre's state; pure, so it is tested without WebGL.
import type { Bounds } from "./jams";

/** A cluster bubble or a single jam, as found in the clustered source. */
export type MarkerItem =
  | {
      kind: "cluster";
      key: string;
      clusterId: number;
      count: number;
      lng: number;
      lat: number;
    }
  | { kind: "jam"; key: string; id: string };

/** The parts of a source feature `toMarkers` reads. */
export type SourceFeature = {
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates?: unknown };
};

/**
 * The markers to draw from `querySourceFeatures`, which repeats a feature in every tile it
 * touches: one per cluster and one per jam.
 */
export function toMarkers(features: SourceFeature[]): MarkerItem[] {
  const seen = new Set<string>();
  const markers: MarkerItem[] = [];
  for (const { properties: p, geometry } of features) {
    if (!p) continue;
    if (p.cluster === true && typeof p.cluster_id === "number") {
      const key = `cluster-${p.cluster_id}`;
      const [lng, lat] = Array.isArray(geometry.coordinates)
        ? (geometry.coordinates as number[])
        : [];
      if (seen.has(key) || lng === undefined || lat === undefined) continue;
      seen.add(key);
      markers.push({
        kind: "cluster",
        key,
        clusterId: p.cluster_id,
        count: Number(p.point_count ?? 0),
        lng,
        lat,
      });
    } else if (typeof p.id === "string" && !seen.has(p.id)) {
      seen.add(p.id);
      markers.push({ kind: "jam", key: p.id, id: p.id });
    }
  }
  return markers;
}

const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

/**
 * The visible box with longitudes in [-180, 180]. Panning across the antimeridian gives
 * edges beyond ±180, and a zoomed-out map can show more than the whole world.
 */
export function normalizeBounds([west, south, east, north]: Bounds): Bounds {
  if (east - west >= 360) return [-180, south, 180, north];
  return [wrap(west), south, wrap(east), north];
}

export type Box = { top: number; right: number; bottom: number; left: number };

/**
 * How far to pan, in pixels, so that `target` sits inside `area`: the argument of
 * `map.panBy`. A target larger than the area keeps its top-left corner in view.
 */
export function panToReveal(target: Box, area: Box): [number, number] {
  const axis = (start: number, end: number, min: number, max: number) => {
    if (start < min) return start - min;
    if (end > max) return Math.min(end - max, start - min);
    return 0;
  };
  return [
    axis(target.left, target.right, area.left, area.right),
    axis(target.top, target.bottom, area.top, area.bottom),
  ];
}
