import { Play } from "@phosphor-icons/react";
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
import { formatDateRange, yearOf } from "../../lib/dates";

type Participation = Schemas["Participation"];

const FIRST_PAGE = 10;
const MORE = 20;

type JamListProps = {
  items: Participation[];
  /** Past rows carry the result badge. */
  past: boolean;
  empty: string;
  onPlay: (participation: Participation) => void;
};

/** Jam rows grouped under sticky year labels, 10 at first, then 20 more at a time (§4.14). */
export function JamList({ items, past, empty, onPlay }: JamListProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(FIRST_PAGE);
  if (items.length === 0) return <InlineEmpty>{empty}</InlineEmpty>;

  const rows: ReactNode[] = [];
  let year: number | null = null;
  for (const participation of items.slice(0, shown)) {
    const rowYear = yearOf(participation.event.starts_on);
    if (rowYear !== year) {
      year = rowYear;
      rows.push(
        <YearLabel key={`year-${rowYear}-${rows.length}`} year={rowYear} />,
      );
    }
    rows.push(
      <JamRow
        key={`${participation.event.id}-${participation.battle?.id ?? participation.role}`}
        participation={participation}
        past={past}
        onPlay={() => onPlay(participation)}
      />,
    );
  }

  return (
    <>
      <ul>{rows}</ul>
      {items.length > shown && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => setShown((n) => n + MORE)}
        >
          {t("dancer.showMore", { count: items.length - shown })}
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

/** One jam a dancer was in (§4.14); the play button shows when there is a video and `onPlay`. */
export function JamRow({
  participation: p,
  past,
  onPlay,
}: {
  participation: Participation;
  past: boolean;
  onPlay?: () => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <li className="relative flex min-h-[76px] items-center gap-3.5 border-b border-border py-3">
      <DateBlock date={p.event.starts_on} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The whole row is the link; the play button sits above it. */}
        <Link
          to={`/jams/${p.event.slug}`}
          className="truncate text-body font-extrabold after:absolute after:inset-0 after:content-['']"
        >
          {p.event.name}
          <span className="sr-only">
            ,{" "}
            {formatDateRange(p.event.starts_on, p.event.ends_on, i18n.language)}
          </span>
        </Link>
        <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
          <Flag code={p.event.country} size="bare" />
          {p.event.city}
        </p>
        {(p.battle || p.role !== "competitor") && (
          <div className="flex flex-wrap gap-1.5">
            {p.battle && <MetaTag>{p.battle.name}</MetaTag>}
            {p.role !== "competitor" && (
              <RoleTag>{t(`dancer.roles.${p.role}`)}</RoleTag>
            )}
          </div>
        )}
      </div>
      {p.video_url && onPlay && (
        <Button
          variant="ghost"
          size="icon"
          className="relative z-[1]"
          aria-label={t("jam.watch", { name: p.event.name })}
          onClick={onPlay}
        >
          <Play size={20} weight="fill" aria-hidden />
        </Button>
      )}
      {past && <ResultBadge finalRank={p.final_rank} reached={p.reached} />}
    </li>
  );
}
