import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas, unwrap } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { InlineNotice } from "../../components/InlineNotice";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/useToast";
import { DeleteJamButton } from "./DeleteJamButton";

type Jam = Schemas["EventResponse"];
type Transition = "close-registration" | "complete" | "cancel";

// §4 "Event status transitions": the one step forward from each public status. A draft goes
// through the publish checklist instead (PublishPanel).
const NEXT: Partial<Record<Schemas["EventStatus"], Transition>> = {
  published: "close-registration",
  registration_closed: "complete",
};
const CANCELLABLE: Schemas["EventStatus"][] = [
  "in_review",
  "published",
  "registration_closed",
];

/** Where a submitted jam is in its lifecycle, the step forward, cancelling and deleting. */
export function StatusActions({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const move = useMutation({
    mutationFn: async (transition: Transition) =>
      unwrap(
        await api.POST("/api/events/{id}/{transition}", {
          params: { path: { id: jam.id, transition } },
        }),
        "transition",
      ),
    onSuccess: (event, transition) => {
      queryClient.setQueryData<Jam | null>(["event", jam.id], (old) =>
        old ? { ...old, ...event } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ kind: "success", message: t(`org.status.done.${transition}`) });
      setConfirming(false);
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  // A draft has the publish checklist instead.
  if (jam.status === "draft") return null;
  const next = NEXT[jam.status];
  return (
    <section
      aria-labelledby="status-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="status-title" className="text-title">
          {t("org.status.title")}
        </h2>
        <StatusBadge status={jam.status} />
      </div>
      <p className="text-body-sm text-muted">
        {t(`org.status.explain.${jam.status}`)}
      </p>
      {jam.review_note && (
        <InlineNotice actionable>
          {t("org.status.sentBack", { note: jam.review_note })}
        </InlineNotice>
      )}
      <div className="flex flex-wrap gap-3">
        {next && (
          <Button
            loading={move.isPending && move.variables === next}
            onClick={() => move.mutate(next)}
          >
            {t(`org.status.action.${next}`)}
          </Button>
        )}
        {CANCELLABLE.includes(jam.status) && (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {t("org.status.action.cancel")}
          </Button>
        )}
        <DeleteJamButton jam={jam} />
      </div>
      {confirming && (
        <Dialog
          onClose={() => setConfirming(false)}
          title={t("org.status.cancelTitle")}
          action={{
            label: t("org.status.action.cancel"),
            cancel: t("org.status.keep"),
            loading: move.isPending,
            onClick: () => move.mutate("cancel"),
          }}
        >
          <p className="text-body text-muted">
            {t("org.status.cancelBody", { name: jam.name })}
          </p>
        </Dialog>
      )}
    </section>
  );
}
