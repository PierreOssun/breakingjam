import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { api, type Schemas } from "../api/client";
import { Button } from "../components/Button";
import { Flag } from "../components/Flag";
import { InlineNotice } from "../components/InlineNotice";
import { SearchPicker } from "../components/SearchPicker";
import { useToast } from "../components/useToast";
import { searchDancers } from "../features/dancers/search";
import { NotFoundPage } from "./NotFoundPage";

type Summary = Pick<
  Schemas["DancerSummary"],
  "id" | "dancer_name" | "country" | "instagram_handle"
>;

/** `/admin/dancers/:id/merge`: fold a duplicate into the dancer who stays (§4 "Merge"). */
export function AdminMergePage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const dancer = useQuery({
    queryKey: ["dancer", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/dancers/{id}", {
        params: { path: { id } },
      });
      if (response.status === 404 || response.status === 400) return null;
      if (!data) throw new Error(`dancer: ${response.status}`);
      return data;
    },
  });
  if (dancer.isPending) return null;
  if (dancer.isError)
    return <p className="px-4 py-10 text-danger">{t("errors.generic")}</p>;
  if (!dancer.data || "merged_into" in dancer.data) return <NotFoundPage />;
  return <Merge loser={dancer.data} />;
}

function Merge({ loser }: { loser: Summary }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [into, setInto] = useState<Summary | null>(null);
  const merge = useMutation({
    mutationFn: async (survivor: Summary) => {
      const { data, error } = await api.POST("/api/admin/dancers/{id}/merge", {
        params: { path: { id: loser.id } },
        body: { into: survivor.id },
      });
      if (!data) throw new Error(error?.error.message ?? t("errors.generic"));
      return survivor;
    },
    onSuccess: (survivor) => {
      toast({
        kind: "success",
        message: t("admin.merge.done", {
          from: loser.dancer_name,
          into: survivor.dancer_name,
        }),
      });
      navigate(`/dancers/${survivor.id}`, { replace: true });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6">
      <title>{`${t("admin.merge.title")} · BreakingJam`}</title>
      <h1 className="font-display text-display-lg">{t("admin.merge.title")}</h1>
      <DancerLine label={t("admin.merge.from")} dancer={loser} />
      {into ? (
        <DancerLine label={t("admin.merge.into")} dancer={into} />
      ) : (
        <SearchPicker<Schemas["DancerSummary"]>
          label={t("admin.merge.into")}
          kind="dancers"
          search={searchDancers}
          idOf={(d) => d.id}
          exclude={[loser.id]}
          renderItem={(d) => (
            <>
              <Flag code={d.country} size="bare" />
              <span className="font-bold">{d.dancer_name}</span>
              {d.instagram_handle && (
                <span className="text-muted">@{d.instagram_handle}</span>
              )}
            </>
          )}
          onPick={setInto}
        />
      )}
      {into && (
        <>
          <InlineNotice actionable>
            {t("admin.merge.explain", {
              from: loser.dancer_name,
              into: into.dancer_name,
            })}
          </InlineNotice>
          <div className="flex flex-wrap gap-3">
            <Button
              loading={merge.isPending}
              onClick={() => merge.mutate(into)}
            >
              {t("admin.merge.confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setInto(null)}>
              {t("admin.merge.change")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function DancerLine({ label, dancer }: { label: string; dancer: Summary }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-text uppercase">{label}</p>
      <p className="flex items-center gap-2 rounded-lg border border-border bg-surface p-4">
        <Flag code={dancer.country} size="bare" />
        <span className="font-extrabold">{dancer.dancer_name}</span>
        {dancer.instagram_handle && (
          <span className="text-muted">@{dancer.instagram_handle}</span>
        )}
      </p>
    </div>
  );
}
