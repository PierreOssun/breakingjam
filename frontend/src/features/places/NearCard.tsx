import { MapPin } from "@phosphor-icons/react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../../components/buttonClasses";
import { Flag, FlagChip } from "../../components/Flag";
import { InlineEmpty } from "../../components/InlineEmpty";
import { Skeleton } from "../../components/Skeleton";
import { formatShortDateRange } from "../../lib/dates";
import { JamFlyer } from "../jams/JamFlyer";
import type { MapJam } from "../map/jams";
import {
  formatKm,
  hasJamIn,
  mapLink,
  NEAR_KM,
  nearestTo,
  type Place,
} from "./near";

// MapLibre is heavy: only searches that name a place load it.
const StaticMap = lazy(() => import("../map/StaticMap"));

/**
 * "Near <Place>" (DESIGN.md §4.33): the closest upcoming jams to the city searched, even when
 * none is in it, on a mini map and as rows; or, with none within 500 km, the place alone.
 */
export function NearCard({ place, jams }: { place: Place; jams: MapJam[] }) {
  const { t } = useTranslation();
  const today = new Date();
  const near = nearestTo(place, jams, today);
  const listed = near.map(({ jam }) => jam);
  return (
    <section
      aria-labelledby="near-title"
      className="overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-col gap-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin
            size={20}
            weight="bold"
            aria-hidden
            className="shrink-0 text-accent-text"
          />
          <h2 id="near-title" className="font-display text-display-sm">
            {t("search.near.title", { place: place.name })}
          </h2>
          <FlagChip code={place.country} />
        </div>
        {near.length > 0 && !hasJamIn(place, jams, today) && (
          <p className="text-body-sm text-muted">
            {t("search.near.closest", { place: place.name })}
          </p>
        )}
      </div>
      <Suspense
        fallback={<Skeleton className="h-[150px] rounded-none lg:h-[200px]" />}
      >
        <StaticMap
          place={place}
          jams={listed}
          zoom={9}
          className="h-[150px] border-y border-border lg:h-[200px]"
        />
      </Suspense>
      {near.length > 0 ? (
        <ul>
          {near.map(({ jam, km }) => (
            <li key={jam.id} className="border-b border-border">
              <NearRow jam={jam} km={km} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 pt-4">
          <InlineEmpty>
            {t("search.near.none", { km: NEAR_KM, place: place.name })}
          </InlineEmpty>
        </div>
      )}
      <div className="p-4">
        <Link
          to={mapLink(place, listed)}
          className={`${buttonClasses("primary", "md")} w-full`}
        >
          {/* Not shrunk by a long place name. */}
          <MapPin size={20} weight="bold" aria-hidden className="shrink-0" />
          {t("search.near.openMap", { place: place.name })}
        </Link>
      </div>
    </section>
  );
}

/** A listed jam: its compact flyer, date, name and city, and how far it is. */
function NearRow({ jam, km }: { jam: MapJam; km: number }) {
  const { i18n } = useTranslation();
  return (
    <Link
      to={`/jams/${jam.slug}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-raised"
    >
      <JamFlyer
        jam={jam}
        compact
        lazy
        className="w-[52px] shrink-0 rounded-[10px]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-label text-primary-text uppercase">
          {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
        </span>
        <span className="text-body font-extrabold break-words">{jam.name}</span>
        <span className="flex items-center gap-1.5 text-body-sm text-muted">
          <Flag code={jam.country} size="bare" />
          {jam.city}
        </span>
      </span>
      <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-surface-raised px-2.5 text-[13px] font-extrabold">
        {formatKm(km, i18n.language)}
      </span>
    </Link>
  );
}
