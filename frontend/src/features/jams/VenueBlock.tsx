import { MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import {
  lazy,
  type KeyboardEvent,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { CountrySelect } from "../../components/CountrySelect";
import { Flag } from "../../components/Flag";
import { FormError } from "../../components/FormError";
import { OptionalLabel } from "../../components/OptionalLabel";
import { TextField } from "../../components/TextField";
import { countryName } from "../../lib/countries";
import type { LngLat } from "../../lib/position";
import { EditorBlock, SummaryLines } from "./EditorBlock";
import { type Place, reverse, search } from "./geocode";
import type { JamFormValues } from "./jamFields";
import type { JamDraft } from "./useAutosave";

// MapLibre is large; the block shows at once and the map follows.
const PinMap = lazy(() => import("../map/PinMap"));

/** Fewer letters find too much to be useful. */
const MIN_LETTERS = 3;
/** How long typing may pause before Photon is asked. */
const PAUSE_MS = 300;

type Filled = Pick<
  JamFormValues,
  "venue_name" | "address" | "city" | "country"
>;

type VenueBlockProps = {
  draft: JamDraft;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

/**
 * Where the jam is (M24): a place search with suggestions as you type, the venue and address
 * it fills in, a map whose pin you drag to the exact door, and the city and country read off
 * the address. A pin dropped before any search asks Photon what is there.
 */
export function VenueBlock({ draft, open, onOpen, onClose }: VenueBlockProps) {
  const { t, i18n } = useTranslation();
  const { values, errors, set } = draft;
  // What the search filled in: a new pick replaces it but never what was typed by hand, and
  // the city and country read as a chip only while they are still these.
  const [filled, setFilled] = useState<Filled>({
    venue_name: "",
    address: "",
    city: values.city,
    country: values.country,
  });
  const fromAddress =
    values.city &&
    values.country &&
    values.city === filled.city &&
    values.country === filled.country;
  const place = [
    values.city,
    values.country && countryName(values.country, i18n.language),
  ]
    .filter(Boolean)
    .join(", ");
  const summary = [values.venue_name, values.address, place].filter(Boolean);
  const pin =
    values.lat !== null && values.lng !== null
      ? { lat: values.lat, lng: values.lng }
      : null;

  const pick = (found: Place) => {
    const next = (key: keyof Filled, value: string | null) =>
      value ?? (values[key] === filled[key] ? "" : values[key]);
    const city = next("city", found.city);
    const country = next("country", found.country);
    setFilled({
      venue_name: found.name ?? "",
      address: found.address ?? "",
      city,
      country,
    });
    set({
      venue_name: next("venue_name", found.name),
      address: next("address", found.address),
      city,
      country,
      lat: found.lat,
      lng: found.lng,
    });
  };

  // The lookup under way for the last dropped pin; a new drop calls it off.
  const lookup = useRef<AbortController>(undefined);

  const drop = async (point: LngLat) => {
    set({ lat: point.lat, lng: point.lng });
    if (values.city && values.country) return;
    // A pin before any search: the address under it names the city and country.
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    try {
      const found = await reverse(point, {
        language: i18n.language,
        signal: controller.signal,
      });
      setFilled((before) => ({
        ...before,
        city: found?.city ?? "",
        country: found?.country ?? "",
      }));
      // What was typed while Photon answered wins over what it names.
      set((current) => ({
        city: current.city || found?.city || "",
        country: current.country || found?.country || "",
      }));
    } catch {
      // Called off, or Photon is down: the fields below stay open to type them.
    }
  };

  return (
    <EditorBlock
      id="venue"
      icon={<MapPin size={20} weight="bold" />}
      title={t("org.blocks.venue")}
      required
      hint={t("org.blocks.venueHint")}
      summary={summary.length > 0 && <SummaryLines lines={summary} />}
      open={open}
      onOpen={onOpen}
      onClose={onClose}
    >
      <PlaceSearch near={pin} onPick={pick} />
      <TextField
        label={<OptionalLabel label={t("org.fields.venue")} />}
        {...draft.field("venue_name")}
      />
      <TextField
        label={<OptionalLabel label={t("org.fields.address")} />}
        autoComplete="street-address"
        {...draft.field("address")}
      />
      <div className="relative">
        <Suspense
          fallback={
            <div className="h-64 rounded-md border border-border-strong bg-surface" />
          }
        >
          <PinMap value={pin} onChange={(point) => void drop(point)} />
        </Suspense>
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-bg/90 px-3 py-1.5 text-caption font-bold shadow-md">
          {t(pin ? "org.venue.dragHint" : "org.venue.tapHint")}
        </p>
      </div>
      {fromAddress ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border-strong px-3 text-body-sm font-bold">
            <Flag code={values.country} size="bare" />
            {place}
          </span>
          <span className="text-caption text-muted">
            {t("org.venue.fromAddress")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilled((before) => ({ ...before, city: "", country: "" }))
            }
          >
            {t("org.editor.edit")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            label={t("org.fields.city")}
            autoComplete="address-level2"
            {...draft.field("city")}
          />
          <CountrySelect
            label={t("org.fields.country")}
            blank={t("org.fields.choose")}
            {...draft.field("country")}
          />
        </div>
      )}
      <FormError message={errors.lat ?? errors.lng ?? errors.root} />
      <p className="text-caption text-muted">{t("org.venue.attribution")}</p>
    </EditorBlock>
  );
}

/** The search field and its suggestions: a combobox the arrow keys and Enter drive too. */
function PlaceSearch({
  near,
  onPick,
}: {
  near: LngLat | null;
  onPick: (place: Place) => void;
}) {
  const { t, i18n } = useTranslation();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [state, setState] = useState<"idle" | "busy" | "none" | "error">(
    "idle",
  );
  const [active, setActive] = useState(-1);
  // The pin only biases the next search; moving it must not search again.
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    const words = query.trim();
    if (words.length < MIN_LETTERS) {
      setPlaces([]);
      setState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("busy");
      try {
        const found = await search(words, {
          language: i18n.language,
          near: nearRef.current,
          signal: controller.signal,
        });
        setPlaces(found);
        setActive(-1);
        setState(found.length > 0 ? "idle" : "none");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, i18n.language]);

  const choose = (place: Place) => {
    onPick(place);
    setQuery("");
    setPlaces([]);
    setState("idle");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (places.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((active + step + places.length) % places.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(places[active] as Place);
    } else if (e.key === "Escape") {
      setPlaces([]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-label text-text uppercase">
        {t("org.venue.find")}
      </label>
      <div className="relative">
        <MagnifyingGlass
          size={20}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
        />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={places.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listId}-${active}` : undefined
          }
          autoComplete="off"
          placeholder={t("org.venue.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-md border border-border-strong bg-surface pr-3.5 pl-11 text-body text-text transition-colors duration-fast placeholder:text-muted focus-visible:border-text"
        />
      </div>
      {places.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("org.venue.results")}
          className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-raised p-1"
        >
          {places.map((place, i) => (
            <li key={place.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-${i}`}
                aria-selected={i === active}
                // Keep the field's focus, so picking never blurs the list away first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(place)}
                className="flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-left transition-colors duration-fast hover:bg-surface aria-selected:bg-surface"
              >
                <MapPin
                  size={18}
                  weight="bold"
                  aria-hidden
                  className="mt-0.5 shrink-0 text-muted"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-bold">{place.title}</span>
                  {place.subtitle && (
                    <span className="text-body-sm text-muted">
                      {place.subtitle}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="text-body-sm text-muted empty:hidden">
        {state === "none" && t("org.venue.none")}
        {state === "error" && (
          <span className="text-danger">{t("org.venue.error")}</span>
        )}
      </p>
    </div>
  );
}
