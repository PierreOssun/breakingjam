import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { InlineNotice } from "../../components/InlineNotice";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/useToast";
import { useMe } from "../auth/useMe";

type Jam = Schemas["EventResponse"];
type Transition =
  "submit" | "publish" | "close-registration" | "complete" | "cancel";

// §4 "Event status transitions": the one step forward from each status. An organiser's draft
// goes to review; the BreakingJam team publishes its own directly.
const NEXT: Partial<Record<Schemas["EventStatus"], Transition>> = {
  draft: "submit",
  published: "close-registration",
  registration_closed: "complete",
};
const CANCELLABLE: Schemas["EventStatus"][] = [
  "draft",
  "in_review",
  "published",
  "registration_closed",
];

/**
 * Where the jam is in its lifecycle, the step forward (review first, for organisers),
 * cancelling and deleting, and the admin's note when a jam was sent back.
 */
export function StatusActions({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(
    null,
  );

  const move = useMutation({
    mutationFn: async (transition: Transition) => {
      const { data, error } = await api.POST("/api/events/{id}/{transition}", {
        params: { path: { id: jam.id, transition } },
      });
      if (!data) throw new Error(error?.error.message ?? "transition failed");
      return data;
    },
    onSuccess: (event, transition) => {
      queryClient.setQueryData<Jam | null>(["event", jam.id], (old) =>
        old ? { ...old, ...event } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ kind: "success", message: t(`org.status.done.${transition}`) });
      setConfirming(null);
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE("/api/events/{id}", {
        params: { path: { id: jam.id } },
      });
      if (!response.ok) throw new Error(t("errors.generic"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ kind: "success", message: t("org.status.deleted") });
      navigate("/org/jams", { replace: true });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  const role = useMe().data?.role;
  // The BreakingJam team publishes its drafts without review.
  const teamDraft =
    jam.status === "draft" && (role === "seed_admin" || role === "admin");
  const next = teamDraft ? "publish" : NEXT[jam.status];
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
        {teamDraft
          ? t("org.status.explain.draftTeam")
          : t(`org.status.explain.${jam.status}`)}
      </p>
      {jam.status === "draft" && jam.review_note && (
        <InlineNotice actionable>
          {t("org.status.sentBack", { note: jam.review_note })}
        </InlineNotice>
      )}
      {jam.status !== "completed" &&
        jam.status !== "cancelled" &&
        jam.lat == null && (
          <InlineNotice actionable>{t("org.status.noPin")}</InlineNotice>
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
          <Button variant="ghost" onClick={() => setConfirming("cancel")}>
            {t("org.status.action.cancel")}
          </Button>
        )}
        <Button variant="ghost" onClick={() => setConfirming("delete")}>
          {t("org.status.delete")}
        </Button>
      </div>
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={
          confirming === "delete"
            ? t("org.status.deleteTitle")
            : t("org.status.cancelTitle")
        }
        footer={(close) => (
          <>
            <Button
              variant="ghost"
              className="flex-1 lg:flex-none"
              onClick={close}
            >
              {t("org.status.keep")}
            </Button>
            <Button
              data-autofocus
              className="flex-[2] lg:flex-none"
              loading={move.isPending || remove.isPending}
              onClick={() =>
                confirming === "delete"
                  ? remove.mutate()
                  : move.mutate("cancel")
              }
            >
              {confirming === "delete"
                ? t("org.status.delete")
                : t("org.status.action.cancel")}
            </Button>
          </>
        )}
      >
        <p className="text-body text-muted">
          {confirming === "delete"
            ? t("org.status.deleteBody", { name: jam.name })
            : t("org.status.cancelBody", { name: jam.name })}
        </p>
      </Dialog>
    </section>
  );
}
