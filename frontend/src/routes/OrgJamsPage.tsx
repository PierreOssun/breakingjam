import { Plus, Ticket } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { buttonClasses } from "../components/buttonClasses";
import { JamRow } from "../components/JamRow";
import { StatusBadge } from "../components/StatusBadge";
import { useMe } from "../features/auth/useMe";
import { useMyJams } from "../features/jams/queries";

/** `/org/jams`: the organiser's jams, drafts included, each opening its edit page. */
export function OrgJamsPage() {
  const { t } = useTranslation();
  const jams = useMyJams();
  const me = useMe().data;
  const items = jams.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
      <title>{`${t("pages.orgJams")} · BreakingJam`}</title>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-display-lg lg:text-display-xl">
          {t("pages.orgJams")}
        </h1>
        {items.length > 0 && (
          <Link to="/org/jams/new" className={buttonClasses("primary", "md")}>
            <Plus size={20} weight="bold" aria-hidden />
            {t("nav.registerJam")}
          </Link>
        )}
      </div>
      {me && items.length > 0 && (
        <Link
          to={`/organizers/${me.id}`}
          className="self-start text-body-sm font-bold text-primary-text underline"
        >
          {t("organizer.yourPage")}
        </Link>
      )}
      {jams.isError && <p className="text-danger">{t("errors.generic")}</p>}
      {jams.isSuccess && items.length === 0 && <NoJams />}
      <ul>
        {items.map((jam) => (
          <li key={jam.id}>
            <JamRow
              jam={jam}
              to={`/org/jams/${jam.id}/edit`}
              trailing={<StatusBadge status={jam.status} />}
            />
          </li>
        ))}
      </ul>
      {jams.hasNextPage && (
        <Button
          variant="secondary"
          loading={jams.isFetchingNextPage}
          onClick={() => void jams.fetchNextPage()}
        >
          {t("org.showMore")}
        </Button>
      )}
    </section>
  );
}

/** §4.7, organiser dashboard: no jam yet. */
function NoJams() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 rounded-lg border border-border bg-surface px-6 py-12 text-center">
      <span
        aria-hidden
        className="relative grid size-[72px] place-items-center rounded-full border border-border-strong"
      >
        <span className="absolute inset-2.5 rounded-full border border-border-strong" />
        <Ticket size={28} weight="bold" className="text-muted" />
      </span>
      <h2 className="font-display text-display-sm">{t("org.empty.title")}</h2>
      <p className="text-body-sm text-muted">{t("org.empty.body")}</p>
      <Link to="/org/jams/new" className={buttonClasses("secondary", "sm")}>
        {t("nav.registerJam")}
      </Link>
    </div>
  );
}
