import { ArrowRight } from "@phosphor-icons/react";
import { lazy, Suspense, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useNearViewport } from "../../lib/useNearViewport";
import { firstView, isPast } from "../map/jams";
import { useMapJams, useVisitorCountry } from "../map/queries";

// MapLibre is heavy: it loads with the preview, and only once the card is near the screen.
const PreviewMap = lazy(() => import("../map/PreviewMap"));

/** The landing page's map card, framed on the visitor's region; it opens `/map` (§4.27). */
export function MapPreview({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const jams = useMapJams();
  const country = useVisitorCountry();
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, true);
  const today = new Date();
  const upcoming = jams.data?.filter((jam) => !isPast(jam, today));

  return (
    <div
      ref={ref}
      className={`relative h-[260px] overflow-hidden rounded-[28px] border border-border bg-surface lg:h-[560px] ${className}`}
    >
      {near && upcoming && !country.isPending && (
        <Suspense fallback={null}>
          {/* The attribution sits over the card's link, so its own links stay clickable. */}
          <div className="absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:z-10">
            <PreviewMap
              jams={upcoming}
              bounds={firstView(upcoming, country.data ?? null)}
              soonest={upcoming[0] ?? null}
            />
          </div>
        </Suspense>
      )}
      {/* Over the map, so the whole card is the link; the attribution still shows through. */}
      <Link
        to="/map"
        className="group absolute inset-0 rounded-[28px] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus"
      >
        {upcoming && (
          <span className="absolute top-4 left-4 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-bg px-3.5 text-[13px] font-extrabold text-text shadow-md">
            <span aria-hidden className="size-2 rounded-full bg-success" />
            {t("landing.preview.upcoming", { count: upcoming.length })}
          </span>
        )}
        {/* A secondary sm button (§4.1) on `bg`, so it reads over the map. */}
        <span className="absolute bottom-4 left-4 inline-flex h-11 items-center gap-2 rounded-full border-2 border-text bg-bg px-[18px] text-body-sm font-bold text-text transition-colors duration-fast group-hover:bg-text group-hover:text-bg">
          {t("landing.mapPreview")}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
