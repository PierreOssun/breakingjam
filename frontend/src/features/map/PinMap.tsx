import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import MapView, {
  AttributionControl,
  type MapRef,
  Marker,
} from "react-map-gl/maplibre";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { maplibre, useMapStyle } from "./maplibre";

export type LngLat = { lng: number; lat: number };

type PinMapProps = {
  value: LngLat | null;
  onChange: (value: LngLat) => void;
};

/**
 * A small map to place a jam: tap to drop the pin, drag it to adjust. When the pin moves
 * from outside (an address search), the map flies to it.
 */
export default function PinMap({ value, onChange }: PinMapProps) {
  const { t } = useTranslation();
  const mapRef = useRef<MapRef>(null);
  const style = useMapStyle();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // The last position the map itself reported, so its own moves don't recentre it.
  const own = useRef<LngLat | null>(null);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    const ours =
      value?.lng === own.current?.lng && value?.lat === own.current?.lat;
    if (!map || !value || ours) return;
    map.easeTo({
      center: [value.lng, value.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: reducedMotion ? 0 : 600,
    });
  }, [value, reducedMotion]);

  const report = (lngLat: LngLat) => {
    const next = { lng: lngLat.lng, lat: lngLat.lat };
    own.current = next;
    onChange(next);
  };

  return (
    <div className="h-64 touch-none overflow-hidden rounded-md border border-border-strong">
      <MapView
        ref={mapRef}
        mapLib={maplibre}
        mapStyle={style}
        initialViewState={
          value
            ? { longitude: value.lng, latitude: value.lat, zoom: 15 }
            : { longitude: 10, latitude: 30, zoom: 1 }
        }
        dragRotate={false}
        touchPitch={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
        onLoad={(e) => e.target.touchZoomRotate.disableRotation()}
        onClick={(e) => report(e.lngLat)}
      >
        <AttributionControl position="bottom-right" compact={false} />
        {value && (
          <Marker
            longitude={value.lng}
            latitude={value.lat}
            draggable
            onDragEnd={(e) => report(e.lngLat)}
          >
            <span
              role="img"
              aria-label={t("org.location.pin")}
              className="block size-7 cursor-grab rounded-full border-2 border-marker-ring bg-primary shadow-selected"
            />
          </Marker>
        )}
      </MapView>
    </div>
  );
}
