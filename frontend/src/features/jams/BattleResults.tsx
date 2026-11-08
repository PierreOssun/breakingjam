import { CaretDown, Crown, Trophy } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import type { Video } from "../../components/VideoDialog";
import { VideoPill } from "../../components/VideoPill";
import { DancerAvatar } from "../dancers/DancerAvatar";
import { membersPerEntry } from "./battleFields";
import { entryLabel } from "./entryFields";
import {
  foldsOnPhones,
  type Pairing,
  type Results,
  type Section,
} from "./rounds";

type Entry = Schemas["Entry"];
type Battle = Schemas["BattleDetail"];

/** A battle's results by round (DESIGN.md §6 Battle results): the final, then each round. */
export function BattleResults({
  battle,
  results,
  onPlay,
}: {
  battle: Battle;
  results: Results;
  onPlay: (video: Video) => void;
}) {
  const { t } = useTranslation();
  const play = (key: Section["key"], pairing: Pairing) =>
    pairing.video &&
    onPlay({
      url: pairing.video.url,
      offset: pairing.video.offset,
      name: `${battle.name} — ${t(`jam.rounds.${key}`)}: ${versus(pairing)}`,
    });
  return (
    <div className="flex flex-col gap-5">
      {results.final && (
        <FinalCard
          pairing={results.final}
          onPlay={() => results.final && play("final", results.final)}
        />
      )}
      {results.sections.map((section) => (
        <RoundSection
          key={section.key}
          battle={battle}
          section={section}
          onPlay={(pairing) => play(section.key, pairing)}
          onPlayEntry={(entry) =>
            onPlay({
              url: entry.video_url ?? "",
              offset: entry.video_offset_seconds,
              name: `${battle.name} — ${entryLabel(entry)}`,
            })
          }
        />
      ))}
    </div>
  );
}

const versus = (pairing: Pairing) =>
  `${entryLabel(pairing.winner)} vs ${entryLabel(pairing.loser)}`;

/** The final: the winner on a trophy tile with "1st", the runner-up under it with "2nd". */
function FinalCard({
  pairing,
  onPlay,
}: {
  pairing: Pairing;
  onPlay: () => void;
}) {
  const { t } = useTranslation();
  const badge =
    "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-caption font-extrabold";
  return (
    <section
      aria-label={t("jam.rounds.final")}
      className="flex flex-col gap-3 rounded-[20px] border border-primary-text/35 bg-linear-to-br from-primary/14 to-accent/12 p-4"
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h4 className="text-label text-primary-text uppercase">
          {t("jam.rounds.final")}
        </h4>
        {pairing.video && <VideoPill name={versus(pairing)} onClick={onPlay} />}
      </div>
      <div className="flex gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-primary text-on-primary">
          <Trophy size={22} weight="fill" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="flex min-w-0 items-center gap-2">
            <Name
              entry={pairing.winner}
              className="font-display text-display-sm"
            />
            <span className={`${badge} bg-primary text-on-primary`}>
              {t("result.rank1")}
            </span>
          </p>
          <AvatarStack entry={pairing.winner} />
          <p className="mt-1.5 flex min-w-0 items-center gap-2">
            <Name entry={pairing.loser} className="text-body text-muted" />
            <AvatarStack entry={pairing.loser} />
            <span
              className={`${badge} ml-auto border-[1.5px] border-primary-text text-primary-text`}
            >
              {t("result.rank2")}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

/** "Semi-finals · 2 battles", then its match cards or, without pairings, its placings. */
function RoundSection({
  battle,
  section,
  onPlay,
  onPlayEntry,
}: {
  battle: Battle;
  section: Section;
  onPlay: (pairing: Pairing) => void;
  onPlayEntry: (entry: Entry) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { key, pairings, placed } = section;
  // A bracket round knocks out one entry a battle, so its placings count its battles too.
  const battles = key === "final" ? 1 : pairings.length + placed.length;
  const count = isBracket(key)
    ? t("jam.rounds.battles", { count: battles })
    : t(
        `jam.entrants.${membersPerEntry(battle) === 1 ? "dancers" : "teams"}NoMax`,
        { count: placed.length },
      );
  const folded = foldsOnPhones(key) && !open;
  // Folded on phones only: from lg every round shows. Whole class names, for Tailwind to find.
  const [grid, flex] = folded
    ? ["hidden lg:grid", "hidden lg:flex"]
    : ["grid", "flex"];
  return (
    <section className="flex flex-col gap-2.5">
      <header className="flex items-center gap-2">
        <h4 className="font-display text-[15px] leading-5 font-extrabold">
          {t(`jam.rounds.${key}`)}
        </h4>
        <span className="text-caption text-muted">{count}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </header>
      {pairings.length > 0 && (
        <ul className={`${grid} gap-2 lg:grid-cols-2`}>
          {pairings.map((pairing) => (
            <MatchCard
              key={pairing.id}
              pairing={pairing}
              onPlay={() => onPlay(pairing)}
            />
          ))}
        </ul>
      )}
      {placed.length > 0 && (
        <ul className={`${flex} flex-col gap-2`}>
          {placed.map((entry) => (
            <PlacedRow
              key={entry.id}
              entry={entry}
              onPlay={() => onPlayEntry(entry)}
            />
          ))}
        </ul>
      )}
      {folded && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-dashed border-border-strong text-body-sm font-bold lg:hidden"
        >
          {t("jam.rounds.showBattles", { count: battles })}
          <CaretDown size={16} weight="bold" aria-hidden />
        </button>
      )}
    </section>
  );
}

/** Prelims and "entered" are no bracket round: they count entrants, not battles. */
const isBracket = (key: Section["key"]) =>
  key !== "prelims" && key !== "entered";

/** An entry placed in a round whose pairings are unknown: its name, avatars and video. */
function PlacedRow({ entry, onPlay }: { entry: Entry; onPlay: () => void }) {
  return (
    <li className="flex min-h-8 items-center gap-2">
      <Name entry={entry} className="text-[15px] leading-5 font-bold" />
      <AvatarStack entry={entry} />
      {entry.video_url && (
        <span className="ml-auto shrink-0">
          <VideoPill name={entryLabel(entry)} onClick={onPlay} />
        </span>
      )}
    </li>
  );
}

/** Two lines, the winner first with the crown; the video pill on the right when there is one. */
function MatchCard({
  pairing,
  onPlay,
}: {
  pairing: Pairing;
  onPlay: () => void;
}) {
  const { t } = useTranslation();
  const line = "flex min-w-0 items-center gap-1.5";
  const name = "text-[15px] leading-5 font-bold text-text";
  return (
    <li className="flex items-center gap-2.5 rounded-[16px] border border-border bg-bg p-2.5 pl-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={line}>
          <Name entry={pairing.winner} className={name} />
          <Crown
            size={18}
            weight="fill"
            role="img"
            aria-label={t("jam.winner")}
            className="shrink-0 text-primary-text"
          />
          <AvatarStack entry={pairing.winner} />
        </p>
        <p className={line}>
          <Name entry={pairing.loser} className={name} />
          <AvatarStack entry={pairing.loser} />
        </p>
      </div>
      {pairing.video && <VideoPill name={versus(pairing)} onClick={onPlay} />}
    </li>
  );
}

/** An entry's name on one line, cut with an ellipsis; a solo dancer's links to their page. */
function Name({ entry, className }: { entry: Entry; className: string }) {
  const [solo] = entry.members;
  const label = entryLabel(entry);
  const shape = `min-w-0 truncate ${className}`;
  if (solo && entry.members.length === 1 && !entry.team_name && !solo.deleted) {
    return (
      <Link
        to={`/dancers/${solo.id}`}
        className={`${shape} underline-offset-2 hover:underline`}
      >
        {label}
      </Link>
    );
  }
  return <span className={shape}>{label}</span>;
}

/** The members' avatars, overlapping, each a link to their page with their name on hover;
 * nothing when they're unknown. */
function AvatarStack({ entry }: { entry: Entry }) {
  if (entry.members.length === 0) return null;
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {entry.members.slice(0, 4).map((member) => {
        const avatar = (
          <>
            <span aria-hidden className="flex">
              <DancerAvatar dancer={member} size="mini" />
            </span>
            {/* At once on hover and focus, where `title` waits a second; the label already
                names the avatar, so screen readers skip this. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 rounded-md bg-text px-2 py-1 text-caption font-bold whitespace-nowrap text-bg opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              {member.dancer_name}
            </span>
          </>
        );
        // Hovered, the avatar comes over its neighbours, and its name over the card.
        const shape =
          "group relative flex rounded-[7px] ring-2 ring-bg hover:z-10 focus-visible:z-10";
        // A deleted dancer has no page: the avatar still says who it was.
        return member.deleted ? (
          <span
            key={member.id}
            role="img"
            aria-label={member.dancer_name}
            className={shape}
          >
            {avatar}
          </span>
        ) : (
          <Link
            key={member.id}
            to={`/dancers/${member.id}`}
            aria-label={member.dancer_name}
            className={shape}
          >
            {avatar}
          </Link>
        );
      })}
    </span>
  );
}
