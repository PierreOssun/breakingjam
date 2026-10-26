import MapView, { AttributionControl, Marker } from "react-map-gl/maplibre";
import { boundsOf } from "./jams";
import { maplibre, useMapStyle } from "./maplibre";

type Point = { lng: number; lat: number };

const JAM_MARKERS = {
  // DESIGN.md §7: an upcoming jam, and the selected one.
  upcoming: "size-5 border-2 border-marker-ring bg-primary shadow-sm",
  selected: "size-7 border-2 border-marker-ring bg-primary shadow-selected",
};

type StaticMapProps = {
  jams: Point[];
  /** The searched place of "Near <Place>", as a violet ring (DESIGN.md §4.33). */
  place?: Point;
  /** How the jams look: the map's markers, or the selected one (the jam page's venue). */
  marker?: keyof typeof JAM_MARKERS;
  /** The zoom around a single point; several are framed together. */
  zoom?: number;
  /** Size, border and radius. */
  className: string;
};

/** A static map in the map page's style, framed on what it marks. Loaded lazily, as MapLibre is
 * heavy; the text next to it always says the same. */
export default function StaticMap({
  jams,
  place,
  marker = "upcoming",
  zoom = 14,
  className,
}: StaticMapProps) {
  const style = useMapStyle();
  const points = place ? [place, ...jams] : jams;
  const box = points.length > 1 ? boundsOf(points) : null;
  const centre = points[0] ?? { lng: 0, lat: 0 };
  const view = box
    ? {
        bounds: [
          [box[0], box[1]],
          [box[2], box[3]],
        ] as [[number, number], [number, number]],
        fitBoundsOptions: { padding: 32, maxZoom: 12 },
      }
    : { longitude: centre.lng, latitude: centre.lat, zoom };
  return (
    <div className={`overflow-hidden ${className}`}>
      <MapView
        mapLib={maplibre}
        mapStyle={style}
        initialViewState={view}
        interactive={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <AttributionControl position="bottom-right" compact={false} />
        {/* Two jams can share a venue, and the list never reorders: the index is the key. */}
        {jams.map((jam, index) => (
          <Marker key={index} longitude={jam.lng} latitude={jam.lat}>
            <span
              aria-hidden
              className={`block rounded-full ${JAM_MARKERS[marker]}`}
            />
          </Marker>
        ))}
        {place && (
          <Marker longitude={place.lng} latitude={place.lat}>
            {/* A soft violet halo, a 3px ring on the page's ground, a dot. */}
            <span aria-hidden className="block rounded-full bg-accent/25 p-1.5">
              <span className="grid size-6 place-items-center rounded-full border-[3px] border-accent bg-bg">
                <span className="size-2 rounded-full bg-accent" />
              </span>
            </span>
          </Marker>
        )}
      </MapView>
    </div>
  );
}
