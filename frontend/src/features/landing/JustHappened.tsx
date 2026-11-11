import { Crown } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api, type Schemas, unwrap } from "../../api/client";
import { Flag } from "../../components/Flag";
import { Loading, Skeleton } from "../../components/Skeleton";
import { VideosChip } from "../../components/VideosChip";
import { formatDateRange, formatShortDateRange } from "../../lib/dates";
import { DancerAvatar } from "../dancers/DancerAvatar";
import { entryLabel } from "../jams/entryFields";
import { JamFlyer } from "../jams/JamFlyer";
import { jamsLink } from "../map/jams";
import { cardShell, stretched } from "../map/RowCard";
import { LandingSection, SECTION_ROW } from "./LandingSection";

type JamResults = Schemas["JamResults"];

/** How many cards load: the API sends three at most. */
const CARDS = 3;
const cell = "w-[290px] shrink-0 snap-start lg:w-auto";

function useLatestResults() {
  return useQuery({
    queryKey: ["results"],
    queryFn: async () => unwrap(await api.GET("/api/results"), "results"),
    staleTime: 5 * 60_000,
  });
}

/** "Just happened": the latest jams with winners, most recent first; hidden without any. */
export function JustHappened() {
  const { t } = useTranslation();
  const query = useLatestResults();
  const results = query.data;
  // Hidden on a failed first load and with no results yet, like the other landing sections.
  if (results?.length === 0 || (!results && query.isError)) return null;

  return (
    <LandingSection
      id="results-title"
      title={t("landing.results.title")}
      sub={t("landing.results.sub")}
      subShort={t("landing.results.subShort")}
      link={{
        to: jamsLink({ when: "past" }),
        label: t("landing.results.all"),
        short: t("landing.results.allShort"),
      }}
    >
      {results ? (
        <ul className={`${SECTION_ROW} lg:grid-cols-3`}>
          {results.map((jam) => (
            <li key={jam.id} className={cell}>
              <ResultCard jam={jam} />
            </li>
          ))}
        </ul>
      ) : (
        <Loading className={`${SECTION_ROW} lg:grid-cols-3`}>
          {Array.from({ length: CARDS }, (_, i) => (
            <Skeleton key={i} className={`${cell} h-[200px] rounded-[20px]`} />
          ))}
        </Loading>
      )}
    </LandingSection>
  );
}

/** One finished jam: its thumbnail and facts, two winners at most, then whether it has videos. */
function ResultCard({ jam }: { jam: JamResults }) {
  const { t, i18n } = useTranslation();
  const more = jam.battle_count - jam.winners.length;
  return (
    <article
      className={`${cardShell} flex h-full flex-col gap-3.5 rounded-[20px] border-border bg-surface p-4`}
    >
      <div className="flex items-center gap-3">
        <JamFlyer
          jam={jam}
          compact
          className="w-[52px] shrink-0 rounded-[10px]"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-label text-primary-text uppercase">
            {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
          </p>
          <h3 className="truncate text-[16px] leading-[22px] font-extrabold">
            <Link to={`/jams/${jam.slug}#battles`} className={stretched}>
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
        </div>
      </div>
      {/* The battle names share one column, as wide as the longest (45% at most, wrapping
          past it), so the crowns line up. */}
      <ul className="grid grid-cols-[fit-content(45%)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t border-border pt-3.5">
        {jam.winners.map((winner) => (
          <li
            key={winner.entry.id}
            className="col-span-2 grid grid-cols-subgrid items-center"
          >
            <span className="text-[12px] leading-4 font-bold break-words text-muted uppercase">
              {winner.battle}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Crown
                size={16}
                weight="fill"
                role="img"
                aria-label={t("jam.winner")}
                className="shrink-0 text-primary-text"
              />
              <span className="min-w-0 truncate text-body-sm font-bold">
                {entryLabel(winner.entry)}
              </span>
              <Avatars members={winner.entry.members} />
            </span>
          </li>
        ))}
        {more > 0 && (
          <li className="col-span-2 text-body-sm text-muted">
            {t("landing.results.more", { count: more })}
          </li>
        )}
      </ul>
      {jam.has_videos && <VideosChip on="card" />}
    </article>
  );
}

/** The winners' avatars, overlapping, each named; the card is the link, so they are not. */
function Avatars({ members }: { members: Schemas["DancerRef"][] }) {
  if (members.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {members.slice(0, 4).map((member) => (
        <span
          key={member.id}
          role="img"
          aria-label={member.dancer_name}
          title={member.dancer_name}
          className="flex rounded-[7px] ring-2 ring-surface"
        >
          <span aria-hidden className="flex">
            <DancerAvatar dancer={member} size="mini" />
          </span>
        </span>
      ))}
    </span>
  );
}
