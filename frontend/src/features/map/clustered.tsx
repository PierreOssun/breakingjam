import type { FeatureCollection, Point } from "geojson";
import { type RefObject, useCallback, useMemo, useState } from "react";
import { Layer, type MapRef, Source } from "react-map-gl/maplibre";
import type { MapJam } from "./jams";
import { type MarkerItem, toMarkers } from "./view";

// §7: clusters up to zoom 12, so from 12 up every marker has its date tag.
export const CLUSTER_MAX_ZOOM = 12;
/** The map's one GeoJSON source of jams. */
export const SOURCE = "jams";

/**
 * A map's clustered GeoJSON source and what to draw from it: the cluster bubbles and the
 * jams left on their own, refreshed from the source as the map moves or loads.
 */
export function useClusteredJams(
  mapRef: RefObject<MapRef | null>,
  jams: MapJam[],
) {
  const [markers, setMarkers] = useState<MarkerItem[]>([]);
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: jams.map((jam) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [jam.lng, jam.lat] },
        properties: { id: jam.id },
      })),
    }),
    [jams],
  );
  const byId = useMemo(() => new Map(jams.map((jam) => [jam.id, jam])), [jams]);
  const refresh = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map?.getSource(SOURCE))
      setMarkers(toMarkers(map.querySourceFeatures(SOURCE)));
  }, [mapRef]);
  const clusters = markers.filter((m) => m.kind === "cluster");
  const single = markers.flatMap((m) =>
    m.kind === "jam" ? (byId.get(m.id) ?? []) : [],
  );
  const source = (
    <Source
      id={SOURCE}
      type="geojson"
      data={data}
      cluster
      clusterRadius={48}
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
    >
      {/* Draws nothing; a source without a layer never loads its tiles. */}
      <Layer
        id={`${SOURCE}-hidden`}
        type="circle"
        paint={{ "circle-radius": 0, "circle-opacity": 0 }}
      />
    </Source>
  );
  return { source, clusters, single, refresh };
}
