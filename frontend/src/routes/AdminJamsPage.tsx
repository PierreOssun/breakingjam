import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api, type Schemas, unwrap } from "../api/client";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { ExternalLink } from "../components/ExternalLink";
import { FormError } from "../components/FormError";
import { InlineEmpty } from "../components/InlineEmpty";
import { MoreList } from "../components/MoreList";
import { MetaTag } from "../components/Tag";
import { TextAreaField } from "../components/TextAreaField";
import { useToast } from "../components/useToast";
import { VerifiedTick } from "../components/VerifiedTick";
import { placeLine } from "../features/jams/jamDetail";
import type { ChecklistItem } from "../features/jams/jamFields";
import { formatDateRange, formatMoment } from "../lib/dates";
import { instagramLabel } from "../lib/instagram";

type Jam = Schemas["ReviewItem"];
type JamDecision = Schemas["JamDecision"];
/** Approve, or send back with a note for the organiser. */
type Decision = { approve: true } | { approve: false; note: string };

/**
 * `/admin/jams`: jams waiting to go public, the soonest first (§4 "Event status"), then every
 * past decision (M31).
 */
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
  const history = useInfiniteQuery({
    queryKey: ["admin", "jams", "history"],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/api/admin/events/history", {
          params: { query: { cursor: pageParam } },
        }),
        "jam decisions",
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
      <section aria-labelledby="jams-history" className="flex flex-col gap-3">
        <h3 id="jams-history" className="font-display text-display-sm">
          {t("admin.history.title")}
        </h3>
        <MoreList
          query={history}
          empty={<InlineEmpty>{t("admin.history.none")}</InlineEmpty>}
          more={t("org.showMore")}
          className="flex flex-col gap-2"
        >
          {(decision) => <JamDecisionRow decision={decision} />}
        </MoreList>
      </section>
    </section>
  );
}

function JamDecisionRow({ decision }: { decision: JamDecision }) {
  const { t, i18n } = useTranslation();
  const approved = decision.action === "jam_approved";
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          to={`/jams/${decision.jam.slug}`}
          className="text-body font-extrabold underline"
        >
          {decision.jam.name}
        </Link>
        <MetaTag>
          {t(approved ? "admin.history.approved" : "admin.history.sentBack")}
        </MetaTag>
      </p>
      <p className="text-body-sm break-words text-muted">
        {t("admin.history.decided", {
          date: formatMoment(decision.decided_at, i18n.language),
          admin: decision.admin_email,
        })}
        {" · "}
        {t("admin.history.organizer", { email: decision.organizer_email })}
      </p>
      {decision.note && (
        <p className="text-body-sm">
          {t("admin.history.note", { note: decision.note })}
        </p>
      )}
    </div>
  );
}

function JamToReview({ jam }: { jam: Jam }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Both decisions ask first: Approve right beside the next jam's would take one slip to misfire.
  const [asking, setAsking] = useState<"approve" | "sendBack" | null>(null);
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
      if (!response.ok) throw new Error(refusal(error, t));
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
      setAsking(null);
    },
    // Shown in the dialog that asked: a toast would sit under it.
  });
  const refused = <FormError message={decide.error?.message} />;
  const close = () => {
    decide.reset();
    setAsking(null);
  };
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
          {placeLine(jam, i18n.language)}
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
              {/* The account's own address, confirmed at sign-up: for the team, never public. */}
              <a
                href={`mailto:${jam.organizer_email}`}
                className="font-bold text-primary-text underline"
              >
                {jam.organizer_email}
              </a>
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
        <Button size="sm" onClick={() => setAsking("approve")}>
          {t("admin.jams.approve")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAsking("sendBack")}>
          {t("admin.jams.sendBack")}
        </Button>
      </div>
      {asking === "approve" && (
        <Dialog
          onClose={close}
          title={t("admin.jams.approveTitle", { name: jam.name })}
          action={{
            label: t("admin.jams.approve"),
            loading: decide.isPending,
            onClick: () => decide.mutate({ approve: true }),
          }}
        >
          <p className="text-body text-muted">{t("admin.jams.approveBody")}</p>
          {refused}
        </Dialog>
      )}
      {asking === "sendBack" && (
        <Dialog
          onClose={close}
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
          {refused}
        </Dialog>
      )}
    </div>
  );
}

/** The checklist items the API names when a jam can't go public, as the editor words them. */
const CHECKLIST_ITEMS: Record<string, ChecklistItem["key"] | undefined> = {
  place: "place",
  battles: "battle",
  contact: "contact",
};

/** Why a decision was refused: the checklist's missing items when it was that, else the API's message. */
function refusal(error: Schemas["ErrorEnvelope"] | undefined, t: TFunction) {
  const items = (error?.error.fields ?? [])
    .map((f) => CHECKLIST_ITEMS[f.field])
    .filter((key) => key !== undefined)
    .map((key) => t(`org.publish.items.${key}`));
  if (items.length > 0)
    return t("admin.jams.incomplete", { items: items.join(", ") });
  return error?.error.message ?? t("errors.generic");
}
