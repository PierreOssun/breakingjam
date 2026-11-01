import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/useToast";

/** Deletes the jam after a confirmation, then returns to the organiser's list. */
export function DeleteJamButton({
  jam,
  className = "",
}: {
  jam: Pick<Schemas["Event"], "id" | "name">;
  className?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
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
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setConfirming(true)}
      >
        {t("org.status.delete")}
      </Button>
      {confirming && (
        <Dialog
          onClose={() => setConfirming(false)}
          title={t("org.status.deleteTitle")}
          action={{
            label: t("org.status.delete"),
            cancel: t("org.status.keep"),
            loading: remove.isPending,
            onClick: () => remove.mutate(),
          }}
        >
          <p className="text-body text-muted">
            {t("org.status.deleteBody", { name: jam.name })}
          </p>
        </Dialog>
      )}
    </>
  );
}
