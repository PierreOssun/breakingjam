import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas, unwrap } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/useToast";
import { DeleteJamButton } from "./DeleteJamButton";
import { storeJam } from "./queries";

type Jam = Schemas["EventResponse"];
type Transition = "close-registration" | "cancel";

/** Where a submitted jam is in its lifecycle, and what the API lets the caller do with it now
 * (`actions`): close registration, cancel, delete. A draft has the checklist (PublishPanel). */
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
      storeJam(queryClient, jam, event);
      // What may come next changed with the status.
      void queryClient.invalidateQueries({
        queryKey: ["event", jam.id],
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ kind: "success", message: t(`org.status.done.${transition}`) });
      setConfirming(false);
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  // A draft has the publish checklist instead.
  if (jam.status === "draft") return null;
  const can = (transition: Transition) => jam.actions.includes(transition);
  // As its badge says: a jam still in review after its date did not "take place".
  const tookPlace =
    jam.phase === "past" &&
    (jam.status === "published" || jam.status === "registration_closed");
  return (
    <section
      aria-labelledby="status-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="status-title" className="text-title">
          {t("org.status.title")}
        </h2>
        <StatusBadge jam={jam} />
      </div>
      <p className="text-body-sm text-muted">
        {t(`org.status.explain.${tookPlace ? "past" : jam.status}`)}
      </p>
      <div className="flex flex-wrap gap-3">
        {can("close-registration") && (
          <Button
            loading={move.isPending && move.variables === "close-registration"}
            onClick={() => move.mutate("close-registration")}
          >
            {t("org.status.action.close-registration")}
          </Button>
        )}
        {can("cancel") && (
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
