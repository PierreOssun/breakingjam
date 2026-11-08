import {
  Clock,
  PencilSimple,
  Trash,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { IconButton } from "../../components/IconButton";
import { ResultBadge } from "../../components/ResultBadge";
import { MetaTag } from "../../components/Tag";
import { useToast } from "../../components/useToast";
import type { Video } from "../../components/VideoDialog";
import { VideoPill } from "../../components/VideoPill";
import { daysOf, formatBattleStart } from "../../lib/dates";
import { AddChip, DancerChip } from "../dancers/DancerChip";
import { BattleDialog } from "./BattleDialog";
import { BattleResults } from "./BattleResults";
import { membersPerEntry, prizeLine } from "./battleFields";
import { entryLabel } from "./entryFields";
import { EntryChips } from "./EntryChips";
import { EntryDialog } from "./EntryDialog";
import { resultsOf } from "./rounds";

type Entry = Schemas["Entry"];

// Where a result sorts: exact placement first, else the stage reached.
const STAGE_ORDER: Record<Schemas["BracketStage"], number> = {
  winner: 1,
  top2: 2,
  top4: 4,
  top8: 8,
  top16: 16,
  top32: 32,
  top64: 64,
  prelims: 100,
  na: 1000,
};

type BattleCardProps = {
  jam: Schemas["EventResponse"];
  battle: Schemas["BattleDetail"];
  onPlay: (video: Video) => void;
};

/**
 * A battle on the jam page (DESIGN.md §6): its start, how full it is, prizes and format, then
 * who entered, best result first. Visitors see the results by round once there are any (M29),
 * else the entries as one wrapping row of chips; the jam's organiser gets a row per entry,
 * withdrawn ones included, to add, edit and delete them.
 */
export function BattleCard({ jam, battle, onPlay }: BattleCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const remove = useDeleteEntry(battle.event_id);
  // Its organiser manages the results, even once the jam is over.
  const canEdit = jam.can_edit_battles;
  const active = battle.entries.filter((e) => e.status !== "withdrawn");
  const shown = [...(canEdit ? battle.entries : active)].sort(
    (a, b) =>
      (a.final_rank ?? STAGE_ORDER[a.reached]) -
      (b.final_rank ?? STAGE_ORDER[b.reached]),
  );
  const results = canEdit ? null : resultsOf(battle);
  const play = (entry: Entry) =>
    onPlay({
      url: entry.video_url ?? "",
      offset: entry.video_offset_seconds,
      name: `${battle.name} — ${entryLabel(entry)}`,
    });

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <BattleHeader jam={jam} battle={battle} entered={active.length} />
      {shown.length === 0 && (
        <p className="text-body-sm text-muted">{t("jam.noEntries")}</p>
      )}
      {results && (
        <BattleResults battle={battle} results={results} onPlay={onPlay} />
      )}
      {shown.length > 0 && !canEdit && !results && (
        // Solo battles: one wrapping row of chips; team battles: a block per team.
        <ul
          className={
            membersPerEntry(battle) === 1
              ? "flex flex-wrap items-center gap-2"
              : "flex flex-col gap-3"
          }
        >
          {shown.map((entry) => (
            <EntryChips key={entry.id} entry={entry} onPlay={play} />
          ))}
        </ul>
      )}
      {shown.length > 0 && canEdit && (
        <ul className="divide-y divide-border">
          {shown.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 py-2.5">
              <EntryWho entry={entry} status={entry.status !== "confirmed"} />
              {entry.video_url && (
                <VideoPill
                  name={entryLabel(entry)}
                  onClick={() => play(entry)}
                />
              )}
              <ResultBadge
                finalRank={entry.final_rank}
                reached={entry.reached}
              />
              <IconButton
                label={t("org.entries.editOne", { name: entryLabel(entry) })}
                onClick={() => setEditing(entry)}
              >
                <PencilSimple size={20} weight="bold" aria-hidden />
              </IconButton>
              <IconButton
                label={t("org.entries.deleteOne", { name: entryLabel(entry) })}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("org.entries.deleteConfirm"))) {
                    remove.mutate(entry);
                  }
                }}
              >
                <Trash size={20} weight="bold" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <div>
            <AddChip
              label={
                membersPerEntry(battle) === 1
                  ? t("org.entries.addDancer")
                  : t("org.entries.addTeam")
              }
              onClick={() => setEditing("new")}
            />
          </div>
          {editing !== null && (
            <EntryDialog
              battle={battle}
              entry={editing === "new" ? undefined : editing}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      )}
    </li>
  );
}

/** Name, start, "8 / 16 dancers" and prizes, with the format as a tag on the right. */
function BattleHeader({
  jam,
  battle,
  entered,
}: {
  jam: Schemas["EventResponse"];
  battle: Schemas["BattleDetail"];
  entered: number;
}) {
  const { t, i18n } = useTranslation();
  const prizes = prizeLine(battle, t, i18n.language);
  const format = formatLabel(battle, t);
  const muted = "flex items-center gap-1.5 text-body-sm text-muted";
  const icon = {
    size: 16,
    weight: "bold" as const,
    "aria-hidden": true,
    className: "shrink-0 text-primary-text",
  };
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="font-display text-display-sm break-words">
          {battle.name}
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {battle.starts_at && (
            <p className={muted}>
              <Clock {...icon} />
              {t("jam.battleStart", {
                when: formatBattleStart(
                  battle.starts_at,
                  jam.starts_on === jam.ends_on,
                  i18n.language,
                ),
              })}
            </p>
          )}
          <p className={muted}>
            <UsersThree {...icon} />
            {entrants(battle, entered, t)}
          </p>
        </div>
        {prizes && (
          <p className={muted}>
            <Trophy {...icon} />
            {prizes}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {format && <MetaTag>{format}</MetaTag>}
        <EditBattle jam={jam} battle={battle} />
      </div>
    </div>
  );
}

/** Once a public jam is over its editor is closed, but its organiser still fixes its battles
 * here (M26); before that, battles are edited in the editor. */
function EditBattle({
  jam,
  battle,
}: {
  jam: Schemas["EventResponse"];
  battle: Schemas["BattleDetail"];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (jam.can_edit || !jam.can_edit_battles) return null;
  return (
    <>
      <IconButton
        label={t("org.battles.editOne", { name: battle.name })}
        onClick={() => setOpen(true)}
      >
        <PencilSimple size={20} weight="bold" aria-hidden />
      </IconButton>
      {open && (
        <BattleDialog
          jamId={jam.id}
          days={daysOf(jam.starts_on, jam.ends_on)}
          battle={battle}
          // Over, the jam is about its results.
          step="results"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** "8 / 16 dancers", or "3 teams" when the battle sets no maximum. */
function entrants(battle: Schemas["Battle"], count: number, t: TFunction) {
  const unit = membersPerEntry(battle) === 1 ? "dancers" : "teams";
  return battle.max_entries == null
    ? t(`jam.entrants.${unit}NoMax`, { count })
    : t(`jam.entrants.${unit}`, { count, max: battle.max_entries });
}

/** "7 to Smoke", "Showcase", "Top 8", or nothing when the format says no more than the name. */
function formatLabel(battle: Schemas["Battle"], t: TFunction): string | null {
  if (battle.format === "seven_to_smoke") return t("jam.format.sevenToSmoke");
  if (battle.format === "showcase") return t("jam.format.showcase");
  if (battle.bracket_size != null)
    return t("jam.format.top", { n: battle.bracket_size });
  return null;
}

/** Team name, then crew and (for the organiser) registration state, then each member as a chip. */
function EntryWho({ entry, status }: { entry: Entry; status: boolean }) {
  const { t } = useTranslation();
  const meta = [
    entry.crew?.name !== entry.team_name && entry.crew?.name,
    status && t(`org.entries.statuses.${entry.status}`),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {entry.team_name && (
        <p className="text-body font-extrabold">{entry.team_name}</p>
      )}
      {meta && <p className="text-caption text-muted">{meta}</p>}
      {/* One member per line on phones: a wrapping row splits some duos and not others. */}
      <ul className="flex flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap">
        {entry.members.map((member) => (
          <li key={member.id}>
            <DancerChip dancer={member} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function useDeleteEntry(jamId: string) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Entry) => {
      const { response } = await api.DELETE("/api/entries/{id}", {
        params: { path: { id: entry.id } },
      });
      if (!response.ok) throw new Error(t("errors.generic"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["event", jamId, "battles"],
      });
      toast({ kind: "success", message: t("org.entries.deleted") });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
}
