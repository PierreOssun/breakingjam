import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api, type Schemas } from "../api/client";
import { Button } from "../components/Button";
import { ExternalLink } from "../components/ExternalLink";
import { InlineEmpty } from "../components/InlineEmpty";
import { useToast } from "../components/useToast";
import { BREAKINGJAM_INSTAGRAM } from "../lib/instagram";

type Decision = "approve" | "reject";

/** One claim as a row shows it, whichever queue it comes from. */
type Review = {
  id: string;
  code: string;
  created_at: string;
  user: Schemas["ClaimUser"];
  /** The page being verified, and where it lives. */
  name: string;
  to: string;
  handle: string | null | undefined;
};
type ReviewPage = { items: Review[]; next_cursor?: string | null };
type DecideFn = (
  id: string,
  decision: Decision,
) => Promise<{ error?: Schemas["ErrorEnvelope"]; response: Response }>;

/**
 * `/admin/claims`: pending dancer claims, then organiser claims, oldest first. The admin
 * checks Instagram by hand (§4 "Verify me").
 */
export function AdminClaimsPage() {
  const { t } = useTranslation();
  const dancers = useQueue("dancers", async (cursor) => {
    const { data } = await api.GET("/api/admin/claims", {
      params: { query: { status: "pending", cursor } },
    });
    if (!data) throw new Error("dancer claims");
    return {
      next_cursor: data.next_cursor,
      items: data.items.map((c) => ({
        ...c,
        name: c.dancer.dancer_name,
        to: `/dancers/${c.dancer.id}`,
        handle: c.dancer.instagram_handle,
      })),
    };
  });
  const organizers = useQueue("organizers", async (cursor) => {
    const { data } = await api.GET("/api/admin/organizer-claims", {
      params: { query: { status: "pending", cursor } },
    });
    if (!data) throw new Error("organiser claims");
    return {
      next_cursor: data.next_cursor,
      items: data.items.map((c) => ({
        ...c,
        name: c.user.display_name,
        to: `/organizers/${c.user.id}`,
        handle: c.instagram_handle,
      })),
    };
  });

  return (
    <section aria-labelledby="claims-title" className="flex flex-col gap-8">
      <title>{`${t("admin.claims.title")} · ${t("admin.title")} · BreakingJam`}</title>
      <div className="flex flex-col gap-3">
        <h2 id="claims-title" className="font-display text-display-md">
          {t("admin.claims.title")}
        </h2>
        <p className="max-w-prose text-body text-muted">
          {t("admin.claims.intro", { account: BREAKINGJAM_INSTAGRAM })}
        </p>
      </div>
      <Queue
        title={t("admin.claims.dancers")}
        queue={dancers}
        decide={(id, decision) => {
          const params = { path: { id } };
          return decision === "approve"
            ? api.POST("/api/admin/claims/{id}/approve", { params })
            : api.POST("/api/admin/claims/{id}/reject", { params });
        }}
      />
      <Queue
        title={t("admin.claims.organizers")}
        queue={organizers}
        decide={(id, decision) => {
          const params = { path: { id } };
          return decision === "approve"
            ? api.POST("/api/admin/organizer-claims/{id}/approve", { params })
            : api.POST("/api/admin/organizer-claims/{id}/reject", { params });
        }}
      />
    </section>
  );
}

function useQueue(
  kind: string,
  fetchPage: (cursor: string | undefined) => Promise<ReviewPage>,
) {
  return useInfiniteQuery({
    queryKey: ["admin", "claims", kind],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

function Queue({
  title,
  queue,
  decide,
}: {
  title: string;
  queue: ReturnType<typeof useQueue>;
  decide: DecideFn;
}) {
  const { t } = useTranslation();
  const items = queue.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-display-sm">{title}</h3>
      {queue.isError && <p className="text-danger">{t("errors.generic")}</p>}
      {queue.isSuccess && items.length === 0 && (
        <InlineEmpty>{t("admin.claims.none")}</InlineEmpty>
      )}
      <ul className="flex flex-col gap-3">
        {items.map((review) => (
          <ClaimRow key={review.id} review={review} decide={decide} />
        ))}
      </ul>
      {queue.hasNextPage && (
        <Button
          variant="secondary"
          className="self-start"
          loading={queue.isFetchingNextPage}
          onClick={() => void queue.fetchNextPage()}
        >
          {t("org.showMore")}
        </Button>
      )}
    </section>
  );
}

function ClaimRow({ review, decide }: { review: Review; decide: DecideFn }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (decision: Decision) => {
      const { error, response } = await decide(review.id, decision);
      if (!response.ok)
        throw new Error(error?.error.message ?? t("errors.generic"));
    },
    onSuccess: (_, decision) => {
      // The claim queues and the overview counts.
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        kind: "success",
        message: t(
          decision === "approve"
            ? "admin.claims.approved"
            : "admin.claims.rejected",
          { name: review.name },
        ),
      });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
  const requested = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
  }).format(new Date(review.created_at));

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to={review.to} className="text-body font-extrabold underline">
            {review.name}
          </Link>
          {review.handle ? (
            <ExternalLink
              href={`https://instagram.com/${review.handle}`}
              className="text-body-sm"
            >
              @{review.handle}
            </ExternalLink>
          ) : (
            <span className="text-body-sm text-muted">
              {t("admin.claims.noHandle")}
            </span>
          )}
        </p>
        <p className="text-body-sm text-muted">
          {t("admin.claims.by", {
            name: review.user.display_name,
            email: review.user.email,
            date: requested,
          })}
        </p>
      </div>
      <span className="font-mono text-title font-bold tracking-[0.08em] select-all">
        {review.code}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={mutation.isPending && mutation.variables === "approve"}
          onClick={() => mutation.mutate("approve")}
        >
          {t("admin.claims.approve")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={mutation.isPending && mutation.variables === "reject"}
          onClick={() => mutation.mutate("reject")}
        >
          {t("admin.claims.reject")}
        </Button>
      </div>
    </li>
  );
}
