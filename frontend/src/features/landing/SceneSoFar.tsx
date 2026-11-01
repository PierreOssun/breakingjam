import { ArrowRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api, unwrap } from "../../api/client";
import { Loading, Skeleton } from "../../components/Skeleton";

function useSiteStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => unwrap(await api.GET("/api/stats"), "stats"),
    staleTime: 5 * 60_000,
  });
}

const GROUPS = "flex flex-col gap-6 lg:flex-row lg:gap-16";
const NUMBER = "font-display text-stat lg:text-display-xl";
// Only the map link is a `group`, so only its captions underline.
const CAPTION = "text-body-sm text-muted group-hover:underline lg:text-body-lg";

/** "BreakingJam so far": past battles and dancers, then what's coming up (§6). */
export function SceneSoFar() {
  const { t, i18n } = useTranslation();
  const query = useSiteStats();
  const stats = query.data;
  // A failed refetch keeps the counts already shown; only a first load that fails hides it.
  if (!stats && query.isError) return null;
  if (!stats)
    return (
      <Shell>
        <Loading className={GROUPS}>
          <Skeleton className="h-16 w-64 rounded-md lg:h-20 lg:w-96" />
          <Skeleton className="h-16 w-64 rounded-md lg:h-20 lg:w-96" />
        </Loading>
      </Shell>
    );
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <Shell>
      <div className={GROUPS}>
        <div className="flex flex-col gap-2">
          <p className="text-label text-muted uppercase">
            {t("landing.scene.past")}
          </p>
          <Counts>
            <Count
              value={number.format(stats.battles_past)}
              label={t("landing.scene.battles", { count: stats.battles_past })}
            />
            <Dot />
            <Count
              value={number.format(stats.dancers)}
              label={t("landing.scene.dancers", { count: stats.dancers })}
            />
          </Counts>
        </div>
        {stats.battles_upcoming > 0 && (
          <Link to="/map" className="group flex flex-col gap-2">
            <span className="text-label text-primary-text uppercase">
              {t("landing.scene.upcoming")}
            </span>
            <Counts>
              <Count
                value={number.format(stats.battles_upcoming)}
                label={t("landing.scene.battles", {
                  count: stats.battles_upcoming,
                })}
              />
              <Dot />
              <span className={CAPTION}>{t("landing.scene.in")}</span>
              <Count
                value={number.format(stats.countries_upcoming)}
                label={t("landing.scene.countries", {
                  count: stats.countries_upcoming,
                })}
              />
              <ArrowRight
                size={20}
                weight="bold"
                aria-hidden
                className="self-center text-primary-text"
              />
            </Counts>
          </Link>
        )}
      </div>
    </Shell>
  );
}

/** One line of counts, wrapping on the narrowest phones. */
function Counts({ children }: { children: ReactNode }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 lg:gap-x-3">
      {children}
    </span>
  );
}

function Count({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 lg:gap-3">
      <span className={NUMBER}>{value}</span>
      <span className={CAPTION}>{label}</span>
    </span>
  );
}

function Dot() {
  return (
    <span aria-hidden className={`${NUMBER} text-muted`}>
      ·
    </span>
  );
}

/** The section and its title, also while the counts load. */
function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="scene-title"
      className="border-t border-border py-10 lg:py-20"
    >
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 md:px-6 lg:gap-8 lg:px-8">
        <h2 id="scene-title" className="text-label text-primary-text uppercase">
          {t("landing.scene.title")}
        </h2>
        {children}
      </div>
    </section>
  );
}
