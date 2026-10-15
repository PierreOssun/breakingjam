import { ArrowRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAdminStats } from "../features/admin/queries";

/** `/admin`: what the site holds, then what waits for review. */
export function AdminOverviewPage() {
  const { t, i18n } = useTranslation();
  const stats = useAdminStats();
  const s = stats.data;
  const number = new Intl.NumberFormat(i18n.language);
  const percent = new Intl.NumberFormat(i18n.language, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const share = (part: number, whole: number) =>
    percent.format(whole === 0 ? 0 : part / whole);

  return (
    <div className="flex flex-col gap-10">
      <title>{`${t("admin.overview.tab")} · ${t("admin.title")} · BreakingJam`}</title>
      {stats.isError && <p className="text-danger">{t("errors.generic")}</p>}
      {s && (
        <>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Stat
              label={t("admin.overview.jams")}
              value={number.format(s.jams_upcoming)}
              detail={t("admin.overview.jamsDetail", {
                past: number.format(s.jams_past),
                draft: number.format(s.jams_draft),
                cancelled: number.format(s.jams_cancelled),
              })}
            />
            <Stat
              label={t("admin.overview.dancers")}
              value={number.format(s.dancers)}
              detail={t("admin.overview.dancersDetail", {
                verified: share(s.dancers_verified, s.dancers),
                instagram: share(s.dancers_with_instagram, s.dancers),
              })}
            />
            <Stat
              label={t("admin.overview.organizers")}
              value={number.format(s.organizers)}
              detail={t("admin.overview.organizersDetail", {
                verified: share(s.organizers_verified, s.organizers),
              })}
            />
            <Stat
              label={t("admin.overview.accounts")}
              value={number.format(s.accounts)}
              detail={t("admin.overview.accountsDetail", {
                count: s.accounts_new,
              })}
            />
          </dl>
          <section
            aria-labelledby="review-title"
            className="flex flex-col gap-4"
          >
            <h2 id="review-title" className="font-display text-display-md">
              {t("admin.overview.toReview")}
            </h2>
            <ul className="flex flex-col gap-3">
              <ReviewLink to="/admin/jams">
                {t("admin.overview.jamsWaiting", { count: s.jams_in_review })}
              </ReviewLink>
              <ReviewLink to="/admin/claims">
                {t("admin.overview.dancerClaims", {
                  count: s.dancer_claims_pending,
                })}
              </ReviewLink>
              <ReviewLink to="/admin/claims">
                {t("admin.overview.organizerClaims", {
                  count: s.organizer_claims_pending,
                })}
              </ReviewLink>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-5">
      <dt className="text-label text-muted uppercase">{label}</dt>
      <dd className="font-display text-display-md">{value}</dd>
      <dd className="text-body-sm text-muted">{detail}</dd>
    </div>
  );
}

function ReviewLink({ to, children }: { to: string; children: string }) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-body font-bold transition-colors duration-fast hover:bg-surface-raised"
      >
        {children}
        <ArrowRight size={20} weight="bold" aria-hidden />
      </Link>
    </li>
  );
}
