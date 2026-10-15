import { CaretDown, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { ResultBadge } from "../../components/ResultBadge";
import { useToast } from "../../components/useToast";
import { entryLabel } from "./entryFields";
import { EntryDialog } from "./EntryDialog";

type Entry = Schemas["Entry"];

/** A battle's entries, folded away until opened: who entered, their status and result. */
export function EntriesEditor({ battle }: { battle: Schemas["Battle"] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const regionId = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const key = ["battle", battle.id, "entries"];
  const entries = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, response } = await api.GET("/api/battles/{id}/entries", {
        params: { path: { id: battle.id } },
      });
      if (!data) throw new Error(`entries: ${response.status}`);
      return data;
    },
  });
  const remove = useMutation({
    mutationFn: async (entry: Entry) => {
      const { response } = await api.DELETE("/api/entries/{id}", {
        params: { path: { id: entry.id } },
      });
      if (!response.ok) throw new Error(t("errors.generic"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      toast({ kind: "success", message: t("org.entries.deleted") });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  const list = entries.data ?? [];
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-md text-body-sm font-bold"
      >
        <CaretDown
          size={16}
          weight="bold"
          aria-hidden
          className={open ? "rotate-180" : ""}
        />
        {t("org.entries.title", { count: list.length })}
      </button>
      <div id={regionId} hidden={!open} className="flex flex-col gap-2">
        <ul className="flex flex-col">
          {list.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 border-b border-border py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-sm font-bold">
                  {entryLabel(entry)}
                </span>
                <span className="truncate text-caption text-muted">
                  {[
                    entry.team_name &&
                      entry.members.map((m) => m.dancer_name).join(" & "),
                    entry.crew?.name,
                    t(`org.entries.statuses.${entry.status}`),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
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
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setEditing("new")}
        >
          <Plus size={16} weight="bold" aria-hidden />
          {t("org.entries.add")}
        </Button>
      </div>
      <EntryDialog
        battle={battle}
        entry={editing === "new" || editing === null ? undefined : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
