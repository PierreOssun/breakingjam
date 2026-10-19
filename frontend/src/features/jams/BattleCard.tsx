import {
  Clock,
  PencilSimple,
  Play,
  Trash,
  Trophy,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { ResultBadge } from "../../components/ResultBadge";
import { useToast } from "../../components/useToast";
import type { Video } from "../../components/VideoDialog";
import { formatBattleStart } from "../../lib/dates";
import { AddChip, DancerChip } from "../dancers/DancerChip";
import { membersPerEntry, prizeLine } from "./battleFields";
import { entryLabel } from "./entryFields";
import { EntryDialog } from "./EntryDialog";

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
  battle: Schemas["Battle"];
  entries: Entry[] | undefined;
  onPlay: (video: Video) => void;
};

/**
 * A battle on the jam page: prizes, spots and who entered, best result first. The jam's
 * organiser also sees withdrawn entries, and adds, edits and deletes them here.
 */
export function BattleCard({ jam, battle, entries, onPlay }: BattleCardProps) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const remove = useDeleteEntry(battle.id);
  const active = (entries ?? []).filter((e) => e.status !== "withdrawn");
  const shown = [...(jam.can_edit ? (entries ?? []) : active)].sort(
    (a, b) =>
      (a.final_rank ?? STAGE_ORDER[a.reached]) -
      (b.final_rank ?? STAGE_ORDER[b.reached]),
  );
  const spots =
    jam.status === "published" && battle.max_entries != null
      ? battle.max_entries - active.length
      : null;
  const prizes = prizeLine(battle, t, i18n.language);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-display-xs">{battle.name}</h3>
          {spots !== null && (
            <span
              className={`text-body-sm ${spots > 0 ? "text-primary-text" : "text-muted"}`}
            >
              {spots > 0 ? t("jam.spotsLeft", { count: spots }) : t("jam.full")}
            </span>
          )}
        </div>
        {battle.starts_at && (
          <p className="flex items-center gap-1.5 text-body-sm text-muted">
            <Clock
              size={16}
              weight="bold"
              aria-hidden
              className="shrink-0 text-primary-text"
            />
            {t("jam.battleStart", {
              when: formatBattleStart(
                battle.starts_at,
                jam.starts_on === jam.ends_on,
                i18n.language,
              ),
            })}
          </p>
        )}
        {prizes && (
          <p className="flex items-center gap-1.5 text-body-sm text-muted">
            <Trophy
              size={16}
              weight="bold"
              aria-hidden
              className="shrink-0 text-primary-text"
            />
            {prizes}
          </p>
        )}
      </div>
      {entries && shown.length === 0 && (
        <p className="text-body-sm text-muted">{t("jam.noEntries")}</p>
      )}
      {shown.length > 0 && (
        <ul className="divide-y divide-border">
          {shown.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 py-2.5">
              <EntryWho
                entry={entry}
                status={jam.can_edit && entry.status !== "confirmed"}
              />
              {entry.video_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("jam.watch", { name: entryLabel(entry) })}
                  onClick={() =>
                    onPlay({
                      url: entry.video_url ?? "",
                      offset: entry.video_offset_seconds,
                      name: `${battle.name} — ${entryLabel(entry)}`,
                    })
                  }
                >
                  <Play size={20} weight="fill" aria-hidden />
                </Button>
              )}
              <ResultBadge
                finalRank={entry.final_rank}
                reached={entry.reached}
              />
              {jam.can_edit && (
                <>
                  <IconButton
                    label={t("org.entries.editOne", {
                      name: entryLabel(entry),
                    })}
                    onClick={() => setEditing(entry)}
                  >
                    <PencilSimple size={20} weight="bold" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t("org.entries.deleteOne", {
                      name: entryLabel(entry),
                    })}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t("org.entries.deleteConfirm"))) {
                        remove.mutate(entry);
                      }
                    }}
                  >
                    <Trash size={20} weight="bold" aria-hidden />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {jam.can_edit && (
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
          <EntryDialog
            battle={battle}
            entry={editing === "new" || editing === null ? undefined : editing}
            open={editing !== null}
            onClose={() => setEditing(null)}
          />
        </>
      )}
    </li>
  );
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
      <ul className="flex flex-wrap gap-1.5">
        {entry.members.map((member) => (
          <li key={member.id}>
            <DancerChip dancer={member} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function useDeleteEntry(battleId: string) {
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
        queryKey: ["battle", battleId, "entries"],
      });
      toast({ kind: "success", message: t("org.entries.deleted") });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
}
