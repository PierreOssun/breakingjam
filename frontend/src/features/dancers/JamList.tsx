import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { DateBlock } from "../../components/DateBlock";
import { Flag } from "../../components/Flag";
import { InlineEmpty } from "../../components/InlineEmpty";
import { ResultBadge } from "../../components/ResultBadge";
import { MetaTag, RoleTag } from "../../components/Tag";
import { VideoPill } from "../../components/VideoPill";
import { formatDateRange, yearOf } from "../../lib/dates";

type Participation = Schemas["Participation"];

const FIRST_PAGE = 10;
const MORE = 20;

type JamListProps = {
  items: Participation[];
  empty: string;
  /** Plays a battle's video (§4.14). */
  onPlay?: (participation: Participation) => void;
};

/** A jam and what the dancer did there: a battle each, or a role on its lineup. */
type Jam = { event: Participation["event"]; parts: Participation[] };

/** One row per jam, in the order given: a dancer in two battles of a jam is one jam. */
function byJam(items: Participation[]): Jam[] {
  const jams = new Map<string, Jam>();
  for (const p of items) {
    const jam = jams.get(p.event.id);
    if (jam) jam.parts.push(p);
    else jams.set(p.event.id, { event: p.event, parts: [p] });
  }
  return [...jams.values()];
}

/** Jam rows grouped under sticky year labels, 10 at first, then 20 more at a time (§4.14). */
export function JamList({ items, empty, onPlay }: JamListProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(FIRST_PAGE);
  if (items.length === 0) return <InlineEmpty>{empty}</InlineEmpty>;

  const jams = byJam(items);
  const rows: ReactNode[] = [];
  let year: number | null = null;
  for (const jam of jams.slice(0, shown)) {
    const rowYear = yearOf(jam.event.starts_on);
    if (rowYear !== year) {
      year = rowYear;
      rows.push(
        <YearLabel key={`year-${rowYear}-${rows.length}`} year={rowYear} />,
      );
    }
    rows.push(<JamRow key={jam.event.id} jam={jam} onPlay={onPlay} />);
  }

  return (
    <>
      <ul>{rows}</ul>
      {jams.length > shown && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => setShown((n) => n + MORE)}
        >
          {t("dancer.showMore", { count: jams.length - shown })}
        </Button>
      )}
    </>
  );
}

function YearLabel({ year }: { year: number }) {
  return (
    // Sticks under the header: 56px tall below lg, 64px from lg.
    <li className="sticky top-14 z-[2] flex items-center gap-3 bg-bg pt-3 pb-2 lg:top-16">
      <span className="font-display text-display-xs">{year}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </li>
  );
}

/** One jam a dancer was in (§4.14): a line per battle or role, with its result and video once
 * known, live jams included. */
function JamRow({
  jam: { event, parts },
  onPlay,
}: {
  jam: Jam;
  onPlay?: (participation: Participation) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <li className="relative flex min-h-[76px] items-center gap-3.5 border-b border-border py-3">
      <DateBlock date={event.starts_on} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The whole row is the link; the play buttons sit above it. */}
        <Link
          to={`/jams/${event.slug}`}
          className="truncate text-body font-extrabold after:absolute after:inset-0 after:content-['']"
        >
          {event.name}
          <span className="sr-only">
            , {formatDateRange(event.starts_on, event.ends_on, i18n.language)}
          </span>
        </Link>
        <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
          {event.country && <Flag code={event.country} size="bare" />}
          {event.city}
        </p>
        {parts.map((p) => (
          <div
            key={p.battle?.id ?? p.role}
            className="flex flex-wrap items-center gap-1.5 empty:hidden"
          >
            {p.battle && <MetaTag>{p.battle.name}</MetaTag>}
            {p.role !== "competitor" && (
              <RoleTag>{t(`dancer.roles.${p.role}`)}</RoleTag>
            )}
            <ResultBadge
              finalRank={p.final_rank}
              reached={p.reached}
              size="sm"
            />
            {p.video_url && onPlay && (
              <span className="relative">
                <VideoPill
                  // Two battles of one jam: each button says which.
                  name={
                    p.battle ? `${event.name} · ${p.battle.name}` : event.name
                  }
                  onClick={() => onPlay(p)}
                />
              </span>
            )}
          </div>
        ))}
      </div>
    </li>
  );
}
