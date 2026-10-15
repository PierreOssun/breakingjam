import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { useAdminStats } from "./queries";

/** `/admin/*`: the admin area's title, then a tab per tool with the size of its queue (§6). */
export function AdminLayout() {
  const { t } = useTranslation();
  const stats = useAdminStats().data;
  const claims =
    stats && stats.dancer_claims_pending + stats.organizer_claims_pending;
  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-4 py-10 md:px-6 lg:px-8">
      <h1 className="font-display text-display-lg">{t("admin.title")}</h1>
      <nav
        aria-label={t("admin.sections")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        <Tab to="/admin" end>
          {t("admin.overview.tab")}
        </Tab>
        <Tab to="/admin/jams" count={stats?.jams_in_review}>
          {t("admin.jams.tab")}
        </Tab>
        <Tab to="/admin/claims" count={claims}>
          {t("admin.claims.tab")}
        </Tab>
      </nav>
      <Outlet />
    </div>
  );
}

/** A filter-chip-shaped tab (DESIGN.md §7), with a count when its queue is not empty. */
function Tab({
  to,
  end,
  count,
  children,
}: {
  to: string;
  end?: boolean;
  count?: number;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-body-sm font-semibold transition-colors duration-fast ${
          isActive
            ? "border-text bg-text text-bg"
            : "border-border-strong text-text hover:bg-surface-raised"
        }`
      }
    >
      {children}
      {/* A space keeps the name "Jams 3", not "Jams3", for screen readers. */}{" "}
      {count ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-caption font-extrabold text-on-primary">
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}
