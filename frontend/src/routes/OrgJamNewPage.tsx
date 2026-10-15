import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../api/client";
import { useToast } from "../components/useToast";
import { ME_KEY } from "../features/auth/useMe";
import { emptyJam } from "../features/jams/jamFields";
import { JamForm } from "../features/jams/JamForm";

/** `/org/jams/new`: register a jam as a draft, then go on to its battles and lineup. */
export function OrgJamNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [initial] = useState(emptyJam);

  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
      <title>{`${t("pages.orgJamNew")} · BreakingJam`}</title>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg lg:text-display-xl">
          {t("pages.orgJamNew")}
        </h1>
        <p className="text-body text-muted">{t("org.newIntro")}</p>
      </div>
      <JamForm
        initial={initial}
        submitLabel={t("org.saveDraft")}
        onSubmit={async (body) => {
          const { data, error } = await api.POST("/api/events", { body });
          if (!data) return error;
          // A first jam makes the account an organiser (§5 Auth).
          void queryClient.invalidateQueries({ queryKey: ME_KEY });
          void queryClient.invalidateQueries({ queryKey: ["events"] });
          toast({ kind: "success", message: t("org.draftSaved") });
          navigate(`/org/jams/${data.id}/edit`, { replace: true });
        }}
      />
    </section>
  );
}
