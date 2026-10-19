import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Flag } from "../../components/Flag";
import { CardStatus } from "../../components/StatusBadge";
import { formatDateRange, formatShortDateRange } from "../../lib/dates";
import { JamFlyer } from "../jams/JamFlyer";
import type { MapJam } from "./jams";
import { cardShell, stretched } from "./RowCard";

/** A jam as a grid card: the 4:5 flyer, then date, title and city (DESIGN.md §4.3). */
export function GridCard({ jam }: { jam: MapJam }) {
  const { i18n } = useTranslation();
  return (
    <article
      className={`${cardShell} flex h-full flex-col overflow-hidden border-border bg-surface`}
    >
      <JamFlyer jam={jam} lazy />
      <div className="flex flex-col items-start gap-2 p-4">
        <p className="text-label text-primary-text uppercase">
          {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
        </p>
        <h3 className="line-clamp-2 font-display text-display-sm break-words">
          <Link to={`/jams/${jam.slug}`} className={stretched}>
            {jam.name}
            <span className="sr-only">
              , {formatDateRange(jam.starts_on, jam.ends_on, i18n.language)},{" "}
              {jam.city}
            </span>
          </Link>
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
