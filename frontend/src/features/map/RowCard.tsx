import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Flag } from "../../components/Flag";
import { Loading, Skeleton } from "../../components/Skeleton";
import { CardStatus } from "../../components/StatusBadge";
import { formatDateRange, formatShortDateRange } from "../../lib/dates";
import { JamFlyer } from "../jams/JamFlyer";
import type { MapJam } from "./jams";

type RowCardProps = {
  jam: MapJam;
  selected?: boolean;
  /** Set in the side panel, where a row shows its jam on the map; else the row links to it. */
  onSelect?: (jam: MapJam, trigger: HTMLElement) => void;
};

/** A card's border, hover and focus ring; the colours come with the card (§4.3). */
export const cardShell =
  "relative rounded-lg border transition-colors duration-fast hover:border-border-strong has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid";
// The title holds the button or link, stretched over the card by `after:`; the focus ring
// moves to the card (§4.3).
export const stretched =
  "text-left after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none";

/** A jam as a row card: the map's side panel and the mobile list (DESIGN.md §4.3). */
export function RowCard({ jam, selected = false, onSelect }: RowCardProps) {
  const { i18n } = useTranslation();
  const name = (
    <>
      {jam.name}
      <span className="sr-only">
        , {formatDateRange(jam.starts_on, jam.ends_on, i18n.language)},{" "}
        {jam.city}
      </span>
    </>
  );
  return (
    <article
      data-row={jam.id}
      className={`${cardShell} flex gap-3 p-3 ${selected ? "border-primary-text bg-surface-raised" : "border-border bg-surface"}`}
    >
      <JamFlyer
        jam={jam}
        compact
        lazy
        className="w-16 shrink-0 self-start rounded-md"
      />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="text-label text-primary-text uppercase">
          {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
        </p>
        <h3 className="line-clamp-2 font-display text-display-xs break-words">
          {onSelect ? (
            <button
              type="button"
              aria-current={selected || undefined}
              onClick={(e) => onSelect(jam, e.currentTarget)}
              className={`cursor-pointer ${stretched}`}
            >
              {name}
            </button>
          ) : (
            <Link to={`/jams/${jam.slug}`} className={stretched}>
              {name}
            </Link>
          )}
        </h3>
        <p className="flex items-center gap-1.5 text-body-sm text-muted">
          <Flag code={jam.country} size="bare" />
          {jam.city}
        </p>
        <CardStatus status={jam.status} />
      </div>
    </article>
  );
}

/** Row cards while jams load (DESIGN.md §4.29): the 64×80 flyer and three lines of text. */
export function RowCardsSkeleton({ className = "" }: { className?: string }) {
  return (
    <Loading className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <Skeleton className="rounded-md h-20 w-16 shrink-0" />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="rounded-md h-4 w-20" />
            <Skeleton className="rounded-md h-4 w-3/4" />
            <Skeleton className="rounded-md h-4 w-1/3" />
          </div>
        </div>
      ))}
    </Loading>
  );
}
