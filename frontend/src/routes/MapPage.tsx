import {
  Crosshair,
  ListBullets,
  MapPin,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useToast } from "../components/useToast";
import { FilterChips } from "../features/map/FilterChips";
import { FilterSheet } from "../features/map/FilterSheet";
import { JamPopup, JamSheet } from "../features/map/JamCard";
import { type Camera, JamMap } from "../features/map/JamMap";
import {
  type Bounds,
  boundsOf,
  distanceKm,
  type Filters,
  firstView,
  inBounds,
  isFiltered,
  isPast,
  type MapJam,
  narrow,
  NO_FILTERS,
} from "../features/map/jams";
import { MapEmpty } from "../features/map/MapEmpty";
import { useMapJams, useVisitorCountry } from "../features/map/queries";
import { RowCard } from "../features/map/RowCard";
import { SearchForm } from "../features/map/SearchForm";
import { currentPosition, type LngLat } from "../lib/position";
import { useMediaQuery } from "../lib/useMediaQuery";

type Selection = { id: string; trigger: HTMLElement | null };

/**
 * A callback ref and the rendered height of its element, kept live as the element comes,
 * changes size or goes; 0 where ResizeObserver is missing.
 */
function useHeight(): [(element: HTMLElement | null) => void, number] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, height];
}

/**
 * `/map`: every upcoming jam on a world map, past ones on demand, narrowed by time, battle category and a search
 * on name, city or country (DESIGN.md §5, §6). ≥ lg a side panel lists the jams in view;
 * below, the map is full-bleed with a list view one tap away.
 */
export function MapPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const wide = useMediaQuery("(min-width: 1024px)");
  const jams = useMapJams();
  const all = jams.data;
  const country = useVisitorCountry();

  // A search arrives as `?q=`, from the search page's "See all on the map" (DESIGN.md §6).
  const [params] = useSearchParams();
  const asked = params.get("q")?.trim() ?? "";
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [query, setQuery] = useState(asked);
  const [search, setSearch] = useState(asked);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const matching = useMemo(
    () => narrow(all ?? [], filters, search, i18n.language, new Date()),
    [all, filters, search, i18n.language],
  );
  const inView = bounds
    ? matching.filter((jam) => inBounds(jam, bounds))
    : matching;
  const narrowed = isFiltered(filters) || search !== "";
  const selected = selection
    ? (matching.find((jam) => jam.id === selection.id) ?? null)
    : null;
  // Whatever hides the selected jam (filters, search, a refetch, the language) unselects it,
  // so it can't pop back later. Set during render: React redoes it before painting.
  if (selection && !selected) setSelection(null);

  // The first view is what a `?q=` search matches, else the visitor's country; later loads
  // (refetches) leave the camera alone.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !all || country.isPending) return;
    framed.current = true;
    const today = new Date();
    const upcoming = all.filter((jam) => !isPast(jam, today));
    const box =
      (asked ? boundsOf(matching) : null) ??
      firstView(upcoming, country.data ?? null);
    if (box)
      setCamera({ kind: "fit", bounds: box, maxZoom: 10, animate: false });
  }, [all, country.isPending, country.data, asked, matching]);

  const select = useCallback((jam: MapJam, trigger: HTMLElement | null) => {
    setSelection({ id: jam.id, trigger });
  }, []);
  const close = useCallback(() => {
    // §4.4: focus goes back to the marker or row that opened it.
    const trigger = selection?.trigger;
    setSelection(null);
    if (trigger?.isConnected) trigger.focus();
  }, [selection]);

  useEffect(() => {
    if (!selection || filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, filtersOpen, close]);

  // Keep the selected row of the side panel in view.
  useEffect(() => {
    if (!wide || !selection) return;
    document
      .querySelector(`[data-row="${CSS.escape(selection.id)}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [wide, selection]);

  function changeQuery(value: string) {
    setQuery(value);
    // Emptying the field brings every jam back without another Enter.
    if (value.trim() === "") setSearch("");
  }

  function submitSearch() {
    const value = query.trim();
    setSearch(value);
    setListOpen(false);
    if (!wide && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur(); // closes the phone keyboard
    }
    if (!value) return;
    const found = narrow(all ?? [], filters, value, i18n.language, new Date());
    const box = boundsOf(found);
    if (box)
      setCamera({ kind: "fit", bounds: box, maxZoom: 13, animate: true });
    // One match is the jam they were looking for: open it.
    const [only] = found;
    setSelection(
      found.length === 1 && only ? { id: only.id, trigger: null } : null,
    );
  }

  function clearAll() {
    setFilters(NO_FILTERS);
    setQuery("");
    setSearch("");
  }

  function locate() {
    currentPosition().then(
      (here) => {
        setUserLocation(here);
        setCamera({ kind: "center", ...here, zoom: 10 });
      },
      () => toast({ kind: "error", message: t("map.locateError") }),
    );
  }

  const [top, topHeight] = useHeight();
  const [bottom, bottomHeight] = useHeight();

  const count = (
    <p role="status" className="text-body-sm text-muted">
      {all && t("map.inArea", { count: inView.length })}
    </p>
  );
  const loadError = jams.isError && (
    <p role="alert" className="text-body-sm text-danger">
      {t("map.loadError")}
    </p>
  );
  const map = (
    <JamMap
      jams={matching}
      selected={selected}
      onSelect={select}
      onClear={() => setSelection(null)}
      onBoundsChange={setBounds}
      camera={camera}
      insets={
        wide
          ? { top: 0, right: 60, bottom: 20, left: 0 }
          : { top: topHeight, right: 0, bottom: bottomHeight, left: 0 }
      }
      popup={
        wide && selected ? (
          <JamPopup jam={selected} onClose={close} />
        ) : undefined
      }
      userLocation={userLocation}
      onLocate={wide ? locate : undefined}
    />
  );

  if (wide) {
    return (
      <div className="absolute inset-0 flex">
        <title>{`${t("pages.map")} · BreakingJam`}</title>
        <h1 className="sr-only">{t("pages.map")}</h1>
        <aside className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-r border-border">
          <div className="flex flex-col gap-4 p-4">
            <SearchForm
              value={query}
              onChange={changeQuery}
              onSubmit={submitSearch}
            />
            <FilterChips
              filters={filters}
              onChange={setFilters}
              variant="panel"
            />
            {count}
            {loadError}
          </div>
          {all && inView.length === 0 ? (
            <MapEmpty onClear={narrowed ? clearAll : null} />
          ) : (
            <ul className="flex flex-col gap-3 px-4 pb-4">
              {inView.map((jam) => (
                <li key={jam.id}>
                  <RowCard
                    jam={jam}
                    selected={jam.id === selected?.id}
                    onSelect={select}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="relative flex-1">{map}</div>
      </div>
    );
  }

  const distance =
    selected && userLocation ? distanceKm(userLocation, selected) : null;
  const emptyHere = narrowed && all !== undefined && inView.length === 0;
  const sheetUp = selected !== null || emptyHere;
  return (
    <div className="absolute inset-0">
      <title>{`${t("pages.map")} · BreakingJam`}</title>
      <h1 className="sr-only">{t("pages.map")}</h1>
      <div inert={listOpen} className="absolute inset-0">
        {map}
      </div>

      <div
        ref={top}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2 pt-3"
      >
        <div className="pointer-events-auto flex gap-2 px-4">
          <SearchForm
            value={query}
            onChange={changeQuery}
            onSubmit={submitSearch}
            floating
          />
          <FilterButton
            active={(filters.when ? 1 : 0) + filters.categories.length}
            onClick={() => setFiltersOpen(true)}
          />
        </div>
        <div className="pointer-events-auto">
          <FilterChips filters={filters} onChange={setFilters} variant="map" />
        </div>
      </div>

      {listOpen ? (
        <>
          <div
            className="absolute inset-0 z-20 flex flex-col gap-3 overflow-y-auto bg-bg px-4 pb-24"
            style={{ paddingTop: topHeight + 8 }}
          >
            {count}
            {loadError}
            {all && inView.length === 0 ? (
              <MapEmpty onClear={narrowed ? clearAll : null} />
            ) : (
              <ul className="flex flex-col gap-3">
                {inView.map((jam) => (
                  <li key={jam.id}>
                    <RowCard jam={jam} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center">
            <Pill onClick={() => setListOpen(false)}>
              <MapPin size={16} weight="bold" aria-hidden />
              {t("map.backToMap")}
            </Pill>
          </div>
        </>
      ) : (
        <div
          ref={bottom}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col"
        >
          {loadError && (
            <div className="pointer-events-auto mx-4 mb-3 rounded-lg border border-border-strong bg-surface-raised p-3 shadow-lg">
              {loadError}
            </div>
          )}
          {/* 16px above the sheet; with none, clear of the attribution under the locate pill. */}
          <div
            className={`flex items-end justify-between px-4 ${sheetUp ? "pb-4" : "pb-8"}`}
          >
            <Pill
              onClick={() => {
                setSelection(null);
                setListOpen(true);
              }}
            >
              <ListBullets size={16} weight="bold" aria-hidden />
              {t("map.list")}
            </Pill>
            <button
              type="button"
              aria-label={t("map.locate")}
              onClick={locate}
              className="pointer-events-auto grid size-11 cursor-pointer place-items-center rounded-full border border-border-strong bg-surface-raised text-text shadow-md transition-colors duration-fast hover:bg-surface"
            >
              <Crosshair size={20} weight="bold" aria-hidden />
            </button>
          </div>
          <div className="pointer-events-auto">
            {selected ? (
              <JamSheet jam={selected} onClose={close} distance={distance} />
            ) : (
              emptyHere && (
                <div className="rounded-t-xl border-t border-border-strong bg-surface-raised shadow-lg">
                  <MapEmpty onClear={clearAll} />
                </div>
              )
            )}
          </div>
        </div>
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        count={inView.length}
      />
    </div>
  );
}

/** A floating pill over the map: List, and Map to come back (DESIGN.md §5). */
function Pill({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-text bg-bg px-[18px] text-body-sm font-bold text-text shadow-md transition-colors duration-fast hover:bg-text hover:text-bg"
    >
      {children}
    </button>
  );
}

/** Opens the filter sheet; a dot says filters are on, the name says how many. */
function FilterButton({
  active,
  onClick,
}: {
  active: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={
        active > 0 ? t("map.filtersOn", { count: active }) : t("map.filters")
      }
      onClick={onClick}
      className="relative grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border border-border-strong bg-surface text-text shadow-sm transition-colors duration-fast hover:bg-surface-raised"
    >
      <SlidersHorizontal size={20} weight="bold" aria-hidden />
      {active > 0 && (
        <span
          aria-hidden
          className="absolute top-2.5 right-2.5 size-2.5 rounded-full border-2 border-surface bg-accent"
        />
      )}
    </button>
  );
}
