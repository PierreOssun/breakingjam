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
import { daysOf } from "../../lib/dates";
import { BattleDialog } from "./BattleDialog";
import { BlockCard, EmptyBlock } from "./EditorBlock";
import { battleSummary } from "./battleFields";
import { useBattles } from "./queries";

type Battle = Schemas["Battle"];

/** The editor's Battles block (M24): "+ Add" while there are none, else the battles in display
 * order with add, edit, reorder and delete. */
export function BattlesEditor({
  jam,
}: {
  jam: Pick<Schemas["EventResponse"], "id" | "starts_on" | "ends_on">;
}) {
  const jamId = jam.id;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const battles = useBattles(jamId);
  const [editing, setEditing] = useState<Battle | "new" | null>(null);
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
          battle={editing === "new" ? undefined : editing}
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
          onAdd={() => setEditing("new")}
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
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h3 className="font-display text-display-xs break-words">
                  {battle.name}
                </h3>
                <p className="text-caption text-muted">
                  {battleSummary(battle, t, i18n.language)}
                </p>
              </div>
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
                onClick={() => setEditing(battle)}
              >
                <PencilSimple size={20} weight="bold" aria-hidden />
              </IconButton>
              <IconButton
                label={t("org.battles.deleteOne", { name: battle.name })}
                onClick={() => setDeleting(battle)}
              >
                <Trash size={20} weight="bold" aria-hidden />
              </IconButton>
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setEditing("new")}
      >
        <Plus size={20} weight="bold" aria-hidden />
        {t("org.battles.add")}
      </Button>
      {dialogs}
    </BlockCard>
  );
}
