import { ArrowRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

// Fixed positions (% of the card) of the decorative markers, clear of the bottom-left
// "Open the map" pill; no data is fetched (§1).
const MARKERS = [
  { x: 22, y: 38 },
  { x: 41, y: 58 },
  { x: 63, y: 30 },
  { x: 74, y: 64 },
  { x: 86, y: 84 },
];

/** A drawing of the map that links to it: the landing page's "Open the map" card. */
export function MapPreview({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/map"
      className={`group relative block h-60 overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-fast hover:border-border-strong lg:h-[480px] ${className}`}
    >
      <span aria-hidden className="absolute inset-0">
        {/* Streets as a plain grid: shapes stay straight, never tilted (DESIGN.md §9). */}
        <span className="absolute inset-x-0 top-[34%] h-px bg-border" />
        <span className="absolute inset-x-0 top-[70%] h-px bg-border" />
        <span className="absolute inset-y-0 left-[28%] w-px bg-border" />
        <span className="absolute inset-y-0 left-[66%] w-px bg-border" />
        {MARKERS.map((m) => (
          <span
            key={`${m.x}-${m.y}`}
            className="absolute size-5 -translate-1/2 rounded-full border-2 border-text bg-primary"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          />
        ))}
        <span
          className="absolute size-7 -translate-1/2 rounded-full border-2 border-text bg-primary shadow-selected"
          style={{ left: "52%", top: "44%" }}
        />
      </span>
      <span className="absolute bottom-4 left-4 inline-flex h-11 items-center gap-2 rounded-full border-2 border-text bg-bg px-[18px] text-body-sm font-bold text-text transition-colors duration-fast group-hover:bg-text group-hover:text-bg">
        {t("landing.mapPreview")}
        <ArrowRight size={16} weight="bold" aria-hidden />
      </span>
    </Link>
  );
}
