import { MagnifyingGlass } from "@phosphor-icons/react";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { countryName } from "../../lib/countries";
import type { LngLat } from "../map/PinMap";
import { geocode, type Place } from "./geocode";

// MapLibre is large; the form shows at once and the map follows.
const PinMap = lazy(() => import("../map/PinMap"));

type LocationFieldProps = {
  /** What the organiser typed; the search is built from it. */
  address: string;
  city: string;
  country: string;
  value: LngLat | null;
  onChange: (value: LngLat | null) => void;
  /** A search result was chosen: fills the city and country when they are empty. */
  onPlace: (place: Place) => void;
};

/**
 * Where the jam is on the map (decided in M12): find the typed address with Nominatim, then
 * tap or drag the pin to the exact spot. Without a pin the jam stays off the map.
 */
export function LocationField(props: LocationFieldProps) {
  const { address, city, country, value, onChange, onPlace } = props;
  const { t, i18n } = useTranslation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<"idle" | "busy" | "none" | "error">(
    "idle",
  );
  // Nominatim's policy: at most one search per second.
  const last = useRef(0);

  async function search() {
    if (Date.now() - last.current < 1000) return;
    last.current = Date.now();
    setStatus("busy");
    const query = [address, city, country && countryName(country, "en")]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
    try {
      const found = await geocode(query, {
        language: i18n.language,
        country: country || undefined,
      });
      setPlaces(found);
      setStatus(found.length > 0 ? "idle" : "none");
      if (found[0]) choose(found[0]);
    } catch {
      setStatus("error");
    }
  }

  function choose(place: Place) {
    onChange({ lng: place.lng, lat: place.lat });
    onPlace(place);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-label text-text uppercase">
        {t("org.location.title")}
      </legend>
      <p className="text-caption text-muted">{t("org.location.hint")}</p>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        loading={status === "busy"}
        disabled={!city.trim()}
        onClick={() => void search()}
      >
        {status !== "busy" && (
          <MagnifyingGlass size={16} weight="bold" aria-hidden />
        )}
        {t("org.location.find")}
      </Button>
      <div aria-live="polite">
        {status === "none" && (
          <p className="text-body-sm text-muted">{t("org.location.none")}</p>
        )}
        {status === "error" && (
          <p className="text-body-sm text-danger">{t("org.location.error")}</p>
        )}
        {places.length > 1 && (
          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted">
              {t("org.location.others")}
            </p>
            {places.map((place) => (
              <button
                key={`${place.lat},${place.lng}`}
                type="button"
                aria-pressed={
                  value?.lat === place.lat && value.lng === place.lng
                }
                onClick={() => choose(place)}
                className="rounded-md px-3 py-2 text-left text-body-sm transition-colors duration-fast hover:bg-surface-raised aria-pressed:bg-surface-raised aria-pressed:font-bold"
              >
                {place.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <Suspense
        fallback={
          <div className="h-64 rounded-md border border-border-strong bg-surface" />
        }
      >
        <PinMap value={value} onChange={onChange} />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted">
          {value ? t("org.location.placed") : t("org.location.unplaced")}
        </p>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("org.location.remove")}
          </Button>
        )}
      </div>
      <p className="text-caption text-muted">{t("org.location.attribution")}</p>
    </fieldset>
  );
}
