import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api, type Schemas, unwrap } from "../api/client";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { ExternalLink } from "../components/ExternalLink";
import { InlineEmpty } from "../components/InlineEmpty";
import { MoreList } from "../components/MoreList";
import { TextAreaField } from "../components/TextAreaField";
import { useToast } from "../components/useToast";
import { VerifiedTick } from "../components/VerifiedTick";
import { countryName } from "../lib/countries";
import { formatDateRange } from "../lib/dates";
import { instagramLabel } from "../lib/instagram";

type Jam = Schemas["EventResponse"];
/** Approve, or send back with a note for the organiser. */
type Decision = { approve: true } | { approve: false; note: string };

/** `/admin/jams`: jams waiting to go public, the soonest first (§4 "Event status"). */
export function AdminJamsPage() {
  const { t } = useTranslation();
  const queue = useInfiniteQuery({
    queryKey: ["admin", "jams"],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/api/admin/events", {
          params: { query: { cursor: pageParam } },
        }),
        "jams in review",
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });

  return (
    <section aria-labelledby="jams-title" className="flex flex-col gap-6">
      <title>{`${t("admin.jams.title")} · ${t("admin.title")} · BreakingJam`}</title>
      <div className="flex flex-col gap-3">
        <h2 id="jams-title" className="font-display text-display-md">
          {t("admin.jams.title")}
        </h2>
        <p className="max-w-prose text-body text-muted">
          {t("admin.jams.intro")}
        </p>
      </div>
      <MoreList
        query={queue}
        empty={<InlineEmpty>{t("admin.jams.none")}</InlineEmpty>}
        more={t("org.showMore")}
        className="flex flex-col gap-3"
      >
        {(jam) => <JamToReview jam={jam} />}
      </MoreList>
    </section>
  );
}

function JamToReview({ jam }: { jam: Jam }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: async (decision: Decision) => {
      const params = { path: { id: jam.id } };
      const { error, response } = decision.approve
        ? await api.POST("/api/admin/events/{id}/approve", { params })
        : await api.POST("/api/admin/events/{id}/reject", {
            params,
            body: { note: decision.note },
          });
      if (!response.ok)
        throw new Error(error?.error.message ?? t("errors.generic"));
    },
    onSuccess: (_, decision) => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({
        kind: "success",
        message: t(
          decision.approve ? "admin.jams.approved" : "admin.jams.sentBack",
          { name: jam.name },
        ),
      });
      setSendingBack(false);
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
  const { organizer } = jam;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={`/jams/${jam.slug}`}
          className="self-start text-body font-extrabold underline"
        >
          {jam.name}
        </Link>
        <p className="text-body-sm text-muted">
          {formatDateRange(jam.starts_on, jam.ends_on, i18n.language)} ·{" "}
          {jam.city}, {countryName(jam.country, i18n.language)}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
          {/* None when the BreakingJam team entered the jam. */}
          {organizer && (
            <>
              <span className="text-muted">{t("admin.jams.by")}</span>
              <Link
                to={`/organizers/${organizer.id}`}
                className="font-bold underline"
              >
                {organizer.display_name}
              </Link>
              {organizer.verified && <VerifiedTick />}
              {organizer.instagram_handle && (
                <ExternalLink
                  href={`https://instagram.com/${organizer.instagram_handle}`}
                >
                  @{organizer.instagram_handle}
                </ExternalLink>
              )}
            </>
          )}
          {jam.instagram_url && (
            <ExternalLink href={jam.instagram_url}>
              {instagramLabel(jam.instagram_url)}
            </ExternalLink>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={decide.isPending && decide.variables.approve}
          onClick={() => decide.mutate({ approve: true })}
        >
          {t("admin.jams.approve")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSendingBack(true)}>
          {t("admin.jams.sendBack")}
        </Button>
      </div>
      {sendingBack && (
        <Dialog
          onClose={() => setSendingBack(false)}
          title={t("admin.jams.sendBackTitle", { name: jam.name })}
          action={{
            label: t("admin.jams.sendBack"),
            disabled: note.trim() === "",
            loading: decide.isPending,
            onClick: () => decide.mutate({ approve: false, note }),
          }}
        >
          <TextAreaField
            data-autofocus
            label={t("admin.jams.note")}
            hint={t("admin.jams.noteHint")}
            rows={4}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Dialog>
      )}
    </div>
  );
}
