import { ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { api, type Schemas } from "../api/client";
import { buttonClasses } from "../components/buttonClasses";
import { Loading, Skeleton } from "../components/Skeleton";
import { useToast } from "../components/useToast";
import { BattlesEditor } from "../features/jams/BattlesEditor";
import { FlyerEditor } from "../features/jams/FlyerEditor";
import { jamValues } from "../features/jams/jamFields";
import { JamForm } from "../features/jams/JamForm";
import { useJam } from "../features/jams/queries";
import { StatusActions } from "../features/jams/StatusActions";
import { NotFoundPage } from "./NotFoundPage";

/** `/org/jams/:id/edit`: status, details, flyer and battles; people are managed on the jam page. */
export function OrgJamEditPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const jam = useJam(id);
  if (jam.isPending) return <EditorSkeleton />;
  if (jam.isError)
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-danger">
        {t("errors.generic")}
      </p>
    );
  // Someone else's jam reads as missing here, as drafts do on the API.
  if (!jam.data?.can_edit) return <NotFoundPage />;
  return <JamEditor jam={jam.data} />;
}

/** The editor's shape while the jam loads (DESIGN.md §4.29): links, title, status, fields. */
function EditorSkeleton() {
  return (
    <Loading className="mx-auto flex max-w-prose flex-col gap-6 px-4 pt-2 pb-10 md:px-6">
      <div className="flex justify-between">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-36 rounded-full" />
      </div>
      <Skeleton className="rounded-md h-10 w-2/3" />
      <Skeleton className="h-28 rounded-lg" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="rounded-md h-12" />
      ))}
    </Loading>
  );
}

function JamEditor({ jam }: { jam: Schemas["EventResponse"] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  // The form keeps what was typed; the cache follows each save.
  const [initial] = useState(() => jamValues(jam));

  return (
    <div className="mx-auto flex max-w-prose flex-col gap-10 px-4 pt-2 pb-10 md:px-6 lg:pb-20">
      <title>{`${jam.name} · ${t("pages.orgJamEdit")} · BreakingJam`}</title>
      <div className="flex items-center justify-between gap-2">
        <Link to="/org/jams" className={buttonClasses("ghost", "sm")}>
          <ArrowLeft size={16} weight="bold" aria-hidden />
          {t("pages.orgJams")}
        </Link>
        <Link to={`/jams/${jam.slug}`} className={buttonClasses("ghost", "sm")}>
          {t("org.viewPage")}
          <ArrowSquareOut size={16} weight="bold" aria-hidden />
        </Link>
      </div>
      <h1 className="font-display text-display-lg break-words lg:text-display-xl">
        {jam.name}
      </h1>
      <StatusActions jam={jam} />
      <section aria-labelledby="details-title" className="flex flex-col gap-6">
        <h2 id="details-title" className="font-display text-display-md">
          {t("org.details")}
        </h2>
        <JamForm
          initial={initial}
          submitLabel={t("form.save")}
          onSubmit={async (body) => {
            const { data, error } = await api.PUT("/api/events/{id}", {
              params: { path: { id: jam.id } },
              body,
            });
            if (!data) return error;
            queryClient.setQueryData<Schemas["EventResponse"] | null>(
              ["event", jam.id],
              (old) => (old ? { ...old, ...data } : old),
            );
            void queryClient.invalidateQueries({ queryKey: ["events"] });
            toast({ kind: "success", message: t("org.saved") });
          }}
        />
      </section>
      <FlyerEditor jam={jam} />
      <BattlesEditor jam={jam} />
      <p className="text-body-sm text-muted">
        {t("org.peopleOnJamPage")}{" "}
        <Link
          to={`/jams/${jam.slug}`}
          className="font-bold text-primary-text underline-offset-2 hover:underline"
        >
          {t("org.viewPage")}
        </Link>
      </p>
    </div>
  );
}
