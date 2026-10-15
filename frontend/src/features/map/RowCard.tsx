import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Flag } from "../../components/Flag";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDateRange, formatShortDateRange } from "../../lib/dates";
import { JamFlyer } from "../jams/JamFlyer";
import type { MapJam } from "./jams";

type RowCardProps = {
  jam: MapJam;
  selected?: boolean;
  /** Set in the side panel, where a row shows its jam on the map; else the row links to it. */
  onSelect?: (jam: MapJam, trigger: HTMLElement) => void;
};

// The title holds the button or link, stretched over the card by `after:`; the focus ring
// moves to the card (§4.3).
const target =
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
      className={`relative flex gap-3 rounded-lg border p-3 transition-colors duration-fast hover:border-border-strong has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid ${selected ? "border-primary-text bg-surface-raised" : "border-border bg-surface"}`}
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
              className={`cursor-pointer ${target}`}
            >
              {name}
            </button>
          ) : (
            <Link to={`/jams/${jam.slug}`} className={target}>
              {name}
            </Link>
          )}
        </h3>
        <p className="flex items-center gap-1.5 text-body-sm text-muted">
          <Flag code={jam.country} size="bare" />
          {jam.city}
        </p>
        <StatusBadge status={jam.status} />
      </div>
    </article>
  );
}
