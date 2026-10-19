import {
  ArrowDown,
  ArrowUp,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { IconButton } from "../../components/IconButton";
import { InlineEmpty } from "../../components/InlineEmpty";
import { useToast } from "../../components/useToast";
import { daysOf } from "../../lib/dates";
import { BattleDialog } from "./BattleDialog";
import { prizeLine, presetOf } from "./battleFields";
import { useBattles } from "./queries";

type Battle = Schemas["Battle"];

/** A jam's battles in display order: add, edit, reorder, delete. */
export function BattlesEditor({
  jam,
}: {
  jam: Pick<Schemas["EventResponse"], "id" | "starts_on" | "ends_on">;
}) {
  const jamId = jam.id;
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const battles = useBattles(jamId);
  const [editing, setEditing] = useState<Battle | "new" | null>(null);
  const [deleting, setDeleting] = useState<Battle | null>(null);
  const key = ["event", jamId, "battles"];

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data } = await api.PUT("/api/events/{id}/battles/order", {
        params: { path: { id: jamId } },
        body: ids,
      });
      if (!data) throw new Error(t("errors.generic"));
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: (error) => toast({ kind: "error", message: error.message }),
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

  return (
    <section aria-labelledby="battles-title" className="flex flex-col gap-4">
      <h2 id="battles-title" className="font-display text-display-md">
        {t("jam.battles")}
      </h2>
      {battles.data && list.length === 0 && (
        <InlineEmpty>{t("org.battles.none")}</InlineEmpty>
      )}
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
                  <BattleSummary battle={battle} />
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

      <BattleDialog
        jamId={jamId}
        days={daysOf(jam.starts_on, jam.ends_on)}
        battle={editing === "new" || editing === null ? undefined : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("org.battles.deleteTitle")}
        footer={(close) => (
          <>
            <Button
              variant="ghost"
              className="flex-1 lg:flex-none"
              onClick={close}
            >
              {t("form.cancel")}
            </Button>
            <Button
              data-autofocus
              className="flex-[2] lg:flex-none"
              loading={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              {t("org.battles.deleteConfirm")}
            </Button>
          </>
        )}
      >
        <p className="text-body text-muted">
          {t("org.battles.deleteBody", { name: deleting?.name ?? "" })}
        </p>
      </Dialog>
    </section>
  );
}

/** "1v1 · Bboys · 18+ · 16 spots · 1st CHF 1,000": the structured fields in words. */
function BattleSummary({ battle }: { battle: Battle }) {
  const { t, i18n } = useTranslation();
  const preset = presetOf(battle);
  const parts = [
    // "1v1" already says it is a team battle.
    battle.format === "team"
      ? `${battle.team_size}v${battle.team_size}`
      : t(`org.battles.formats.${battle.format}`),
    t(`org.battles.genders.${battle.gender}`),
    preset === "kids"
      ? t("org.battles.kidsRange", {
          from: battle.age_min ?? 0,
          to: battle.age_max ?? 17,
        })
      : preset !== "na" &&
        t("org.battles.adultFrom", { from: battle.age_min ?? 18 }),
    battle.bracket_size &&
      t("org.battles.bracketOf", { n: battle.bracket_size }),
    battle.max_entries && t("org.battles.spots", { count: battle.max_entries }),
    prizeLine(battle, t, i18n.language),
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}
