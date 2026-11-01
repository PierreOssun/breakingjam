import {
  CaretRight,
  CheckCircle,
  Circle,
  RocketLaunch,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas, unwrap } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/useToast";
import { useMe } from "../auth/useMe";
import type { ChecklistItem } from "./jamFields";

type Jam = Schemas["EventResponse"];
type Jump = (block: NonNullable<ChecklistItem["block"]>) => void;

/** Sends the draft on its way: to review for organisers, straight to the map for the team. */
function usePublish(jam: Jam) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const role = useMe().data?.role;
  const transition =
    role === "seed_admin" || role === "admin" ? "publish" : "submit";
  const move = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/api/events/{id}/{transition}", {
          params: { path: { id: jam.id, transition } },
        }),
        "transition",
      ),
    onSuccess: (event) => {
      for (const key of [jam.id, jam.slug]) {
        queryClient.setQueryData<Jam | null>(["event", key], (old) =>
          old ? { ...old, ...event } : old,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ kind: "success", message: t(`org.status.done.${transition}`) });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
  return { transition, publish: () => move.mutate(), pending: move.isPending };
}

const missingOf = (items: ChecklistItem[]) =>
  items.filter((item) => !item.done).length;

/** "Publish", or "Publish · 2 left" and disabled while the checklist has gaps. */
export function PublishButton({
  jam,
  items,
  className = "",
}: {
  jam: Jam;
  items: ChecklistItem[];
  className?: string;
}) {
  const { t } = useTranslation();
  const { publish, pending } = usePublish(jam);
  const missing = missingOf(items);
  return (
    <Button
      size="sm"
      className={className}
      disabled={missing > 0}
      loading={pending}
      onClick={publish}
    >
      {!pending && <RocketLaunch size={16} weight="bold" aria-hidden />}
      {missing > 0
        ? t("org.publish.left", { count: missing })
        : t("org.publish.action")}
    </Button>
  );
}

/** The checklist card under the flyer on desktop (M24). */
export function PublishCard({
  jam,
  items,
  onJump,
}: {
  jam: Jam;
  items: ChecklistItem[];
  onJump: Jump;
}) {
  const { t } = useTranslation();
  const { transition } = usePublish(jam);
  const done = items.length - missingOf(items);
  return (
    <section
      aria-labelledby="publish-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="publish-title" className="text-title">
          {t("org.publish.title")}
        </h2>
        <span className="text-body-sm text-muted">
          {t("org.publish.progress", { done, total: items.length })}
        </span>
      </div>
      <Progress done={done} total={items.length} />
      <Checklist items={items} onJump={onJump} />
      <PublishButton jam={jam} items={items} className="w-full" />
      <p className="text-center text-caption text-muted">
        {t(
          transition === "publish" ? "org.publish.team" : "org.publish.review",
        )}{" "}
        {t("org.publish.private")}
      </p>
    </section>
  );
}

/** The sticky bar along the bottom on phones; its button opens the checklist as a sheet. */
export function PublishBar({
  jam,
  items,
  onJump,
}: {
  jam: Jam;
  items: ChecklistItem[];
  onJump: Jump;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { publish, pending } = usePublish(jam);
  const missing = missingOf(items);
  const done = items.length - missing;
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-border bg-bg px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden">
      <div className="flex items-center gap-3">
        <Progress done={done} total={items.length} className="flex-1" />
        <span className="text-body-sm text-muted">
          {t("org.publish.toPublish", { done, total: items.length })}
        </span>
      </div>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <RocketLaunch size={20} weight="bold" aria-hidden />
        {missing > 0
          ? t("org.publish.left", { count: missing })
          : t("org.publish.action")}
      </Button>
      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          title={t(missing > 0 ? "org.publish.almost" : "org.publish.title")}
          action={{
            label: t("org.publish.action"),
            disabled: missing > 0,
            loading: pending,
            onClick: () => {
              publish();
              setOpen(false);
            },
          }}
        >
          <p className="text-body text-muted">
            {missing > 0
              ? t("org.publish.missing", { count: missing })
              : t("org.publish.ready")}
          </p>
          <Progress done={done} total={items.length} />
          <Checklist
            items={items}
            onJump={(block) => {
              setOpen(false);
              onJump(block);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

/** Name, dates, city and pin, a battle: ticked when done, with "Add" leading to the block. */
function Checklist({
  items,
  onJump,
}: {
  items: ChecklistItem[];
  onJump: Jump;
}) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-h-11 items-center gap-3 text-body"
        >
          {item.done ? (
            <CheckCircle
              size={24}
              weight="fill"
              aria-hidden
              className="shrink-0 text-success"
            />
          ) : (
            <Circle
              size={24}
              weight="bold"
              aria-hidden
              className="shrink-0 text-border-strong"
            />
          )}
          <span className="flex-1">{t(`org.publish.items.${item.key}`)}</span>
          {!item.done && item.block && (
            <button
              type="button"
              onClick={() =>
                onJump(item.block as NonNullable<ChecklistItem["block"]>)
              }
              aria-label={`${t("org.publish.add")}: ${t(`org.publish.items.${item.key}`)}`}
              className="inline-flex min-h-11 cursor-pointer items-center gap-0.5 text-body-sm font-bold text-primary-text hover:underline"
            >
              {t("org.publish.add")}
              <CaretRight size={14} weight="bold" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Progress({
  done,
  total,
  className = "",
}: {
  done: number;
  total: number;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      className={`h-1.5 overflow-hidden rounded-full bg-border ${className}`}
    >
      <div
        className="h-full rounded-full bg-success transition-[width] duration-fast"
        style={{ width: `${(done / total) * 100}%` }}
      />
    </div>
  );
}
