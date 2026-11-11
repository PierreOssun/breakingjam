import {
  ArrowDown,
  ArrowUp,
  PencilSimple,
  Plus,
  Trash,
  Trophy,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas, unwrap } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { IconButton } from "../../components/IconButton";
import { useToast } from "../../components/useToast";
import { daysOf, formatBattleStart } from "../../lib/dates";
import { BattleDialog } from "./BattleDialog";
import { BlockCard, EmptyBlock } from "./EditorBlock";
import { battleSummary } from "./battleFields";
import { takesResults } from "./jamDetail";
import { useBattles } from "./queries";

type Battle = Schemas["BattleDetail"];

/** The editor's Battles block (M24): "+ Add" while there are none, else the battles in display
 * order with add, edit, reorder and delete. */
export function BattlesEditor({
  jam,
}: {
  jam: Pick<
    Schemas["EventResponse"],
    "id" | "status" | "starts_on" | "ends_on" | "phase" | "country"
  >;
}) {
  const jamId = jam.id;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const battles = useBattles(jamId);
  // The battle sheet: a new battle, or one opened on its details or its results.
  const [editing, setEditing] = useState<{
    battle?: Battle;
    step: "details" | "results";
  } | null>(null);
  const [deleting, setDeleting] = useState<Battle | null>(null);
  const key = ["event", jamId, "battles"];

  const reorder = useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(
        await api.PUT("/api/events/{id}/battles/order", {
          params: { path: { id: jamId } },
          body: ids,
        }),
        "battle order",
      ),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: () => toast({ kind: "error", message: t("errors.generic") }),
  });
  const remove = useMutation({
    mutationFn: async (battle: Battle) => {
      const { response } = await api.DELETE("/api/battles/{id}", {
        params: { path: { id: battle.id } },
      });
      if (!response.ok) throw new Error(t("errors.generic"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      toast({ kind: "success", message: t("org.battles.deleted") });
      setDeleting(null);
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  const list = battles.data ?? [];
  // A submitted jam keeps a battle: the API refuses to delete its last one.
  const keepsLast = jam.status !== "draft" && list.length === 1;
  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((b) => b.id);
    const [moved] = ids.splice(index, 1);
    if (moved) ids.splice(index + by, 0, moved);
    reorder.mutate(ids);
  };

  const dialogs = (
    <>
      {editing !== null && (
        <BattleDialog
          jamId={jamId}
          days={daysOf(jam.starts_on, jam.ends_on)}
          country={jam.country}
          battle={editing.battle}
          step={editing.step}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Dialog
          onClose={() => setDeleting(null)}
          title={t("org.battles.deleteTitle")}
          action={{
            label: t("org.battles.deleteConfirm"),
            loading: remove.isPending,
            onClick: () => remove.mutate(deleting),
          }}
        >
          <p className="text-body text-muted">
            {t("org.battles.deleteBody", { name: deleting.name })}
          </p>
        </Dialog>
      )}
    </>
  );
  if (!battles.data) return null;
  if (list.length === 0) {
    return (
      <>
        <EmptyBlock
          id="battles"
          icon={<Trophy size={20} weight="bold" />}
          title={t("jam.battles")}
          required
          hint={t("org.blocks.battlesHint")}
          onAdd={() => setEditing({ step: "details" })}
        />
        {dialogs}
      </>
    );
  }
  return (
    <BlockCard
      id="battles"
      icon={<Trophy size={20} weight="bold" />}
      title={t("jam.battles")}
    >
      <ol className="flex flex-col gap-4">
        {list.map((battle, index) => (
          <li
            key={battle.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            {/* Actions under the name on phones: beside it, four buttons leave the name a sliver. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h3 className="font-display text-display-xs break-words">
                  {battle.name}
                </h3>
                <p className="text-caption text-muted">
                  {[
                    battle.starts_at &&
                      t("jam.battleStart", {
                        when: formatBattleStart(
                          battle.starts_at,
                          jam.starts_on === jam.ends_on,
                          i18n.language,
                        ),
                      }),
                    battleSummary(battle, t, i18n.language),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {/* Wraps on phones, the icons as one group: with the button they don't fit a line. */}
              <div className="-mb-1 flex flex-wrap items-center justify-end gap-1">
                {/* Once the jam has started, its results are what's left to fill in. */}
                {takesResults(jam) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mr-auto"
                    onClick={() => setEditing({ battle, step: "results" })}
                  >
                    <Trophy size={18} weight="bold" aria-hidden />
                    {t("org.results.enter")}
                  </Button>
                )}
                <div className="flex gap-1">
                  <IconButton
                    label={t("org.battles.moveUp", { name: battle.name })}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={20} weight="bold" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t("org.battles.moveDown", { name: battle.name })}
                    disabled={index === list.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={20} weight="bold" aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t("org.battles.editOne", { name: battle.name })}
                    onClick={() => setEditing({ battle, step: "details" })}
                  >
                    <PencilSimple size={20} weight="bold" aria-hidden />
                  </IconButton>
                  {!keepsLast && (
                    <IconButton
                      label={t("org.battles.deleteOne", { name: battle.name })}
                      onClick={() => setDeleting(battle)}
                    >
                      <Trash size={20} weight="bold" aria-hidden />
                    </IconButton>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setEditing({ step: "details" })}
      >
        <Plus size={20} weight="bold" aria-hidden />
        {t("org.battles.add")}
      </Button>
      {dialogs}
    </BlockCard>
  );
}
