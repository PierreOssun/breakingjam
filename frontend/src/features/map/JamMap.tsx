import { Crosshair, Minus, Plus } from "@phosphor-icons/react";
import type { FeatureCollection, Point } from "geojson";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import MapView, {
  AttributionControl,
  Layer,
  type MapRef,
  Marker,
  Source,
} from "react-map-gl/maplibre";
import { dayAndMonth, formatDateRange } from "../../lib/dates";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { type Bounds, boundsOf, clusterLabel, type MapJam } from "./jams";
import { maplibre, useMapStyle } from "./maplibre";
import {
  type Box,
  type MarkerItem,
  normalizeBounds,
  panToReveal,
  toMarkers,
} from "./view";

const SOURCE = "jams";
// §7: clusters up to zoom 12, so from 12 up every marker has its date tag.
const CLUSTER_MAX_ZOOM = 12;
const DATE_TAGS_FROM = 12;
// Where the anchored popup's caret ends: 14px (half the selected marker) plus an 8px gap.
const POPUP_LIFT = 22;
const MOVE_MS = 600;

/** A camera move asked for by the page: a new object for each move. */
export type Camera =
  | { kind: "fit"; bounds: Bounds; maxZoom: number; animate: boolean }
  | { kind: "center"; lng: number; lat: number; zoom: number };

type JamMapProps = {
  /** The jams that pass the filters and search. */
  jams: MapJam[];
  selected: MapJam | null;
  /** `trigger` is the marker, so focus can go back to it when the popup closes. */
  onSelect: (jam: MapJam, trigger: HTMLElement) => void;
  /** A tap on the map itself. */
  onClear: () => void;
  onBoundsChange: (bounds: Bounds) => void;
  camera: Camera | null;
  /** Pixels on each side covered by the page's floating controls or sheet. */
  insets: Box;
  /** The anchored popup over the selected marker (≥ lg); below lg the page shows a sheet. */
  popup?: ReactNode;
  userLocation: { lng: number; lat: number } | null;
  /** Shows the zoom and locate group top-right (≥ lg); below lg the page has its own pill. */
  onLocate?: () => void;
};

/**
 * The world map of jams (DESIGN.md §7): MapLibre with Protomaps tiles, clustered HTML
 * markers, and the selected jam's popup anchored above its marker.
 */
export function JamMap(props: JamMapProps) {
  const { jams, selected, onSelect, camera, insets, popup, userLocation } =
    props;
  const { t } = useTranslation();
  const mapRef = useRef<MapRef>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [markers, setMarkers] = useState<MarkerItem[]>([]);
  const [zoom, setZoom] = useState(0);
  const style = useMapStyle();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Read by map callbacks without re-subscribing them on every render.
  const latest = useRef({ props, reducedMotion });
  useLayoutEffect(() => {
    latest.current = { props, reducedMotion };
  });
  const duration = useCallback(
    (ms: number) => (latest.current.reducedMotion ? 0 : ms),
    [],
  );
  const padding = useCallback(() => {
    const i = latest.current.props.insets;
    return {
      top: i.top + 32,
      right: i.right + 32,
      bottom: i.bottom + 32,
      left: i.left + 32,
    };
  }, []);

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

  /** Redraws markers from the clustered source and reports the visible box. */
  const refresh = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map?.getSource(SOURCE)) return;
    setMarkers(toMarkers(map.querySourceFeatures(SOURCE)));
    setZoom(map.getZoom());
    const b = map.getBounds();
    latest.current.props.onBoundsChange(
      normalizeBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]),
    );
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !map || !camera) return;
    if (camera.kind === "fit") {
      map.fitBounds(camera.bounds, {
        padding: padding(),
        maxZoom: camera.maxZoom,
        duration: camera.animate ? duration(MOVE_MS) : 0,
      });
    } else {
      map.easeTo({
        center: [camera.lng, camera.lat],
        zoom: camera.zoom,
        duration: duration(MOVE_MS),
      });
    }
  }, [ready, camera, duration, padding]);

  // The popup follows its marker: placed once, then on every frame the map moves.
  const selectedId = selected?.id;
  const hasPopup = popup != null;
  useLayoutEffect(() => {
    const map = mapRef.current?.getMap();
    const element = popupRef.current;
    const jam = latest.current.props.selected;
    if (!ready || !map || !element || !jam) return;
    const place = () => {
      // The copy of the world nearest the centre, as MapLibre does for markers.
      const lng =
        jam.lng + 360 * Math.round((map.getCenter().lng - jam.lng) / 360);
      const { x, y } = map.project([lng, jam.lat]);
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) translateY(-${POPUP_LIFT}px)`;
    };
    place();
    map.on("move", place);
    return () => {
      map.off("move", place);
    };
  }, [ready, selectedId, hasPopup]);

  // §4.4: pan so the selected marker and its popup are in view, clear of the page's
  // controls and sheet; after any camera move in progress.
  const insetBottom = insets.bottom;
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !map || !selectedId) return;
    const reveal = () => {
      const container = map.getContainer();
      const elements = [
        popupRef.current,
        container.querySelector(`[data-jam="${CSS.escape(selectedId)}"]`),
      ].filter((e): e is Element => e !== null);
      if (elements.length === 0) return;
      const rects = elements.map((e) => e.getBoundingClientRect());
      const box = container.getBoundingClientRect();
      const i = latest.current.props.insets;
      const [dx, dy] = panToReveal(
        {
          top: Math.min(...rects.map((r) => r.top)),
          right: Math.max(...rects.map((r) => r.right)),
          bottom: Math.max(...rects.map((r) => r.bottom)),
          left: Math.min(...rects.map((r) => r.left)),
        },
        {
          top: box.top + i.top + 16,
          right: box.right - i.right - 16,
          bottom: box.bottom - i.bottom - 16,
          left: box.left + i.left + 16,
        },
      );
      if (dx !== 0 || dy !== 0)
        map.panBy([dx, dy], { duration: duration(300) });
    };
    if (map.isMoving()) {
      map.once("moveend", reveal);
      return () => {
        map.off("moveend", reveal);
      };
    }
    const frame = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(frame);
  }, [ready, selectedId, insetBottom, duration]);

  async function zoomToCluster(clusterId: number) {
    const map = mapRef.current?.getMap();
    const source = map?.getSource<maplibre.GeoJSONSource>(SOURCE);
    if (!map || !source) return;
    const leaves = await source.getClusterLeaves(clusterId, 1000, 0);
    const box = boundsOf(
      leaves.flatMap((leaf) =>
        leaf.geometry.type === "Point"
          ? [
              {
                lng: leaf.geometry.coordinates[0] ?? 0,
                lat: leaf.geometry.coordinates[1] ?? 0,
              },
            ]
          : [],
      ),
    );
    if (box) {
      map.fitBounds(box, {
        padding: padding(),
        maxZoom: 16,
        duration: duration(MOVE_MS),
      });
    }
  }

  const shown = markers.flatMap((m) =>
    m.kind === "jam" ? (byId.get(m.id) ?? []) : [],
  );
  // The selected jam keeps its marker even when it sits inside a cluster.
  if (selected && !shown.some((jam) => jam.id === selected.id)) {
    shown.push(selected);
  }

  return (
    <div className="absolute inset-0 touch-none">
      <MapView
        ref={mapRef}
        mapLib={maplibre}
        mapStyle={style}
        initialViewState={{ longitude: 10, latitude: 30, zoom: 1.5 }}
        minZoom={1}
        maxZoom={18}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        onLoad={(e) => {
          e.target.touchZoomRotate.disableRotation();
          setReady(true);
          refresh();
        }}
        onMoveEnd={refresh}
        onSourceData={(e) => {
          if (e.sourceId === SOURCE && e.isSourceLoaded) refresh();
        }}
        onClick={(e) => {
          // Markers live inside the map; a click on one is not a click on the map.
          const target = e.originalEvent.target;
          if (target instanceof Element && target.closest(".maplibregl-marker"))
            return;
          props.onClear();
        }}
      >
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
        <AttributionControl position="bottom-right" compact={false} />

        {markers.map((m) =>
          m.kind === "cluster" ? (
            <Marker key={m.key} longitude={m.lng} latitude={m.lat}>
              <ClusterButton
                count={m.count}
                onClick={() => void zoomToCluster(m.clusterId)}
              />
            </Marker>
          ) : null,
        )}
        {shown.map((jam) => {
          const isSelected = jam.id === selected?.id;
          return (
            <Marker
              key={jam.id}
              longitude={jam.lng}
              latitude={jam.lat}
              style={isSelected ? { zIndex: 2 } : undefined}
            >
              <JamMarker
                jam={jam}
                selected={isSelected}
                showDate={isSelected || zoom >= DATE_TAGS_FROM}
                onSelect={onSelect}
              />
            </Marker>
          );
        })}
        {userLocation && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat}>
            <span
              role="img"
              aria-label={t("map.you")}
              className="block size-4 rounded-full border-2 border-marker-ring bg-accent shadow-sm"
            />
          </Marker>
        )}
      </MapView>

      {selected && popup && (
        // Outside MapLibre's canvas container, so clicks, drags and wheel turns in the
        // popup never reach the map.
        <div
          ref={popupRef}
          className="pointer-events-none absolute top-0 left-0 z-10 pb-2.5"
        >
          <div className="pointer-events-auto">{popup}</div>
        </div>
      )}

      {props.onLocate && (
        <MapControls
          onZoomIn={() =>
            mapRef.current?.getMap().zoomIn({ duration: duration(300) })
          }
          onZoomOut={() =>
            mapRef.current?.getMap().zoomOut({ duration: duration(300) })
          }
          onLocate={props.onLocate}
        />
      )}
    </div>
  );
}

function JamMarker({
  jam,
  selected,
  showDate,
  onSelect,
}: {
  jam: MapJam;
  selected: boolean;
  showDate: boolean;
  onSelect: JamMapProps["onSelect"];
}) {
  const { i18n } = useTranslation();
  const { day, month } = dayAndMonth(jam.starts_on, i18n.language);
  const dates = formatDateRange(jam.starts_on, jam.ends_on, i18n.language);
  return (
    // A 44px hit area around a 20px dot (§8), named like "Concrete Cypher, Saturday 14
    // November 2026, Zurich" (§7).
    <button
      type="button"
      data-jam={jam.id}
      aria-label={`${jam.name}, ${dates}, ${jam.city}`}
      aria-haspopup="dialog"
      aria-expanded={selected}
      onClick={(e) => onSelect(jam, e.currentTarget)}
      className="relative grid size-11 cursor-pointer place-items-center rounded-full"
    >
      <span
        aria-hidden
        className={`rounded-full border-2 border-marker-ring bg-primary ${selected ? "size-7 shadow-selected" : "size-5 shadow-sm"}`}
      />
      {showDate && (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1/2 left-1/2 -translate-y-1/2 rounded-full border border-primary-text bg-bg px-1.5 text-label whitespace-nowrap text-primary-text uppercase ${selected ? "ml-[18px]" : "ml-[14px]"}`}
        >
          {day} {month}
        </span>
      )}
    </button>
  );
}

function ClusterButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  // §7: 36px for 2–9, 44px for 10–99, 56px from 100; the hit area is never under 44px.
  const hit = count >= 100 ? "size-14" : "size-11";
  const visual = count >= 10 ? hit : "size-9";
  return (
    <button
      type="button"
      aria-label={t("map.cluster", { count })}
      onClick={onClick}
      className={`grid cursor-pointer place-items-center rounded-full ${hit}`}
    >
      <span
        aria-hidden
        className={`grid place-items-center rounded-full border-2 border-primary-text bg-bg text-[14px] leading-none font-extrabold text-primary-text shadow-sm ${visual}`}
      >
        {clusterLabel(count)}
      </span>
    </button>
  );
}

const controlClasses =
  "grid size-11 cursor-pointer place-items-center text-text transition-colors duration-fast hover:bg-surface";

/** Zoom in, zoom out and locate: a 44px icon-button group, top-right (§5). */
function MapControls({
  onZoomIn,
  onZoomOut,
  onLocate,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col rounded-md border border-border-strong bg-surface-raised shadow-md">
      <button
        type="button"
        aria-label={t("map.zoomIn")}
        onClick={onZoomIn}
        className={`${controlClasses} rounded-t-md`}
      >
        <Plus size={20} weight="bold" aria-hidden />
      </button>
      <span aria-hidden className="h-px bg-border" />
      <button
        type="button"
        aria-label={t("map.zoomOut")}
        onClick={onZoomOut}
        className={controlClasses}
      >
        <Minus size={20} weight="bold" aria-hidden />
      </button>
      <span aria-hidden className="h-px bg-border" />
      <button
        type="button"
        aria-label={t("map.locate")}
        onClick={onLocate}
        className={`${controlClasses} rounded-b-md`}
      >
        <Crosshair size={20} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
