import { useRef } from "react";
import { useTranslation } from "react-i18next";
import MapView, {
  AttributionControl,
  type MapRef,
  Marker,
} from "react-map-gl/maplibre";
import { formatShortDateRange } from "../../lib/dates";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { JamFlyer } from "../jams/JamFlyer";
import { useClusteredJams } from "./clustered";
import { ClusterDot } from "./ClusterDot";
import type { Bounds, MapJam } from "./jams";
import { maplibre, useMapStyle } from "./maplibre";

const SOURCE = "preview";
// From lg the soonest jam carries a 300px popup above it: frame the jams so it never
// leaves the card (half its width on each side, its height on top).
const POPUP_ROOM = { top: 150, right: 170, bottom: 72, left: 170 };

type PreviewMapProps = {
  jams: MapJam[];
  bounds: Bounds | null;
  /** Gets the mini popup, from lg up. */
  soonest: MapJam | null;
};

/**
 * The landing page's map (DESIGN.md §4.27): the map page's style, markers and clusters,
 * but nothing to touch; the card around it is the link.
 */
export default function PreviewMap({ jams, bounds, soonest }: PreviewMapProps) {
  const mapRef = useRef<MapRef>(null);
  const style = useMapStyle();
  const wide = useMediaQuery("(min-width: 1024px)");
  const { source, clusters, single, refresh } = useClusteredJams(
    mapRef,
    SOURCE,
    jams,
  );

  return (
    <MapView
      ref={mapRef}
      mapLib={maplibre}
      mapStyle={style}
      interactive={false}
      initialViewState={
        bounds
          ? {
              bounds,
              fitBoundsOptions: {
                padding: wide ? POPUP_ROOM : 32,
                maxZoom: 10,
              },
            }
          : { longitude: 10, latitude: 30, zoom: 1 }
      }
      attributionControl={false}
      style={{ width: "100%", height: "100%" }}
      onLoad={refresh}
      onSourceData={(e) => {
        if (e.sourceId === SOURCE && e.isSourceLoaded) refresh();
      }}
    >
      {source}
      <AttributionControl position="bottom-right" compact={false} />
      {clusters.map((m) => (
        <Marker key={m.key} longitude={m.lng} latitude={m.lat}>
          <ClusterDot count={m.count} />
        </Marker>
      ))}
      {single.map((jam) => (
        <Marker key={jam.id} longitude={jam.lng} latitude={jam.lat}>
          <span
            aria-hidden
            className="block size-5 rounded-full border-2 border-marker-ring bg-primary shadow-sm"
          />
        </Marker>
      ))}
      {soonest && (
        <Marker
          longitude={soonest.lng}
          latitude={soonest.lat}
          anchor="bottom"
          offset={[0, -16]}
        >
          <MiniPopup jam={soonest} />
        </Marker>
      )}
    </MapView>
  );
}

/** The soonest jam over its marker; plain text, since the whole card is the link. */
function MiniPopup({ jam }: { jam: MapJam }) {
  const { i18n } = useTranslation();
  return (
    <div className="hidden w-[300px] gap-3 rounded-lg border border-border-strong bg-surface-raised p-3 text-left shadow-lg lg:flex">
      <JamFlyer jam={jam} compact className="w-16 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-label text-primary-text uppercase">
          {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
        </p>
        <p className="line-clamp-2 font-display text-display-xs break-words text-text">
          {jam.name}
        </p>
        <p className="text-body-sm text-muted">{jam.city}</p>
      </div>
    </div>
  );
}
