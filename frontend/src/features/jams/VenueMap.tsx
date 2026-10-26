import MapView, { AttributionControl, Marker } from "react-map-gl/maplibre";
import { maplibre, useMapStyle } from "../map/maplibre";

/** The venue on a static map, its marker centred (DESIGN.md §6 Jam detail, Venue). Loaded
 * lazily, as MapLibre is heavy; the jam page shows the address beside it. */
export default function VenueMap({ lng, lat }: { lng: number; lat: number }) {
  const style = useMapStyle();
  return (
    <div className="h-[170px] overflow-hidden rounded-lg border border-border lg:h-[220px]">
      <MapView
        mapLib={maplibre}
        mapStyle={style}
        initialViewState={{ longitude: lng, latitude: lat, zoom: 14 }}
        interactive={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <AttributionControl position="bottom-right" compact={false} />
        <Marker longitude={lng} latitude={lat}>
          <span
            aria-hidden
            className="block size-7 rounded-full border-2 border-marker-ring bg-primary shadow-selected"
          />
        </Marker>
      </MapView>
    </div>
  );
}
