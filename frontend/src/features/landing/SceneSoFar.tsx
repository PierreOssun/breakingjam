import { ArrowRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api, unwrap } from "../../api/client";
import { Loading } from "../../components/Skeleton";

function useSiteStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => unwrap(await api.GET("/api/stats"), "stats"),
    staleTime: 5 * 60_000,
  });
}

const GROUPS = "mt-5 flex flex-col gap-6 lg:mt-6 lg:flex-row lg:gap-24";
const LABEL =
  "text-[12px] leading-4 font-bold tracking-[.1em] text-[#C7D4FF] uppercase";
// Only the map link is a `group`, so only its captions underline.
const CAPTION =
  "text-[16px] font-semibold text-[#DCE4FF] group-hover:underline lg:text-[18px]";

/** "BreakingJam so far": past battles and dancers, then what's coming up, on the brand band (§4.42). */
export function SceneSoFar() {
  const { t, i18n } = useTranslation();
  const query = useSiteStats();
  const stats = query.data;
  // A failed refetch keeps the counts already shown; only a first load that fails hides it.
  if (!stats && query.isError) return null;
  if (!stats)
    return (
      <Band>
        <Loading className={GROUPS}>
          <span className="block h-[72px] w-64 rounded-md bg-on-primary/15 motion-safe:animate-pulse lg:h-[86px] lg:w-96" />
          <span className="block h-[72px] w-64 rounded-md bg-on-primary/15 motion-safe:animate-pulse lg:h-[86px] lg:w-96" />
        </Loading>
      </Band>
    );
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <Band>
      <div className={GROUPS}>
        <div className="flex flex-col gap-2">
          <p className={LABEL}>{t("landing.scene.past")}</p>
          <Counts>
            <Count
              value={number.format(stats.battles_past)}
              label={t("landing.scene.battles", { count: stats.battles_past })}
            />
            <Count
              value={number.format(stats.dancers)}
              label={t("landing.scene.dancers", { count: stats.dancers })}
            />
          </Counts>
        </div>
        {stats.battles_upcoming > 0 && (
          <Link
            to="/map"
            className="group flex flex-col gap-2 rounded-md focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-on-primary focus-visible:outline-solid"
          >
            <span className={LABEL}>{t("landing.scene.upcoming")}</span>
            <Counts>
              <Count
                value={number.format(stats.battles_upcoming)}
                label={t("landing.scene.battles", {
                  count: stats.battles_upcoming,
                })}
              />
              <Count
                value={number.format(stats.countries_upcoming)}
                label={t("landing.scene.countries", {
                  count: stats.countries_upcoming,
                })}
              />
              <ArrowRight
                size={24}
                weight="bold"
                aria-hidden
                className="self-center"
              />
            </Counts>
          </Link>
        )}
      </div>
    </Band>
  );
}

/** One line of counts, wrapping on the narrowest phones. */
function Counts({ children }: { children: ReactNode }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1 lg:gap-x-7">
      {children}
    </span>
  );
}

function Count({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-display text-[34px] leading-[40px] font-extrabold tracking-[-0.02em] lg:text-[48px] lg:leading-[54px]">
        {value}
      </span>
      <span className={CAPTION}>{label}</span>
    </span>
  );
}

/** The band and its title, also while the counts load: white on the brand gradient in both
 * themes, with faint rings in its top-right corner. */
function Band({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="scene-title"
      className="mx-auto max-w-content px-4 pb-18 md:px-6 lg:px-8"
    >
      <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#002FA7_0%,#2A1FB5_60%,#6D3AF5_100%)] px-5 py-6 text-on-primary lg:px-12 lg:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[260px] -right-[260px] size-[560px] rounded-full bg-[repeating-radial-gradient(circle_at_center,transparent_0_27px,rgba(255,255,255,.08)_27px_28px)]"
        />
        <div className="relative">
          <h2
            id="scene-title"
            className="font-display text-[18px] leading-6 font-extrabold lg:text-[22px] lg:leading-7"
          >
            {t("landing.scene.title")}
          </h2>
          {children}
        </div>
      </div>
    </section>
  );
}
