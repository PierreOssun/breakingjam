import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Flag } from "../../components/Flag";
import { countryName } from "../../lib/countries";

/** How many countries the battles-by-country list shows before "+ N more". */
const TOP_COUNTRIES = 10;

function useSiteStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/stats");
      if (!data) throw new Error(`stats: ${response.status}`);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** How far BreakingJam reaches: countries, battles and dancers, then battles by country. */
export function SiteCounts() {
  const { t, i18n } = useTranslation();
  const stats = useSiteStats().data;
  if (!stats) return null;
  const number = new Intl.NumberFormat(i18n.language);
  const top = stats.battles_by_country.slice(0, TOP_COUNTRIES);
  const more = stats.battles_by_country.length - top.length;

  return (
    <section aria-labelledby="counts-title" className="border-t border-border">
      <div className="mx-auto grid max-w-content gap-8 px-4 py-10 md:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-16">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <h2
            id="counts-title"
            className="font-display text-display-md lg:text-display-xl"
          >
            {t("landing.counts.title")}
          </h2>
          <dl className="grid grid-cols-3 gap-3">
            <Count
              label={t("landing.counts.countries")}
              value={number.format(stats.countries)}
            />
            <Count
              label={t("landing.counts.battles")}
              value={number.format(stats.battles)}
            />
            <Count
              label={t("landing.counts.dancers")}
              value={number.format(stats.dancers)}
            />
          </dl>
        </div>
        {top.length > 0 && (
          <div className="flex flex-col gap-3 lg:col-span-7">
            <h3 className="text-title">{t("landing.counts.byCountry")}</h3>
            <ol className="grid gap-2 sm:grid-cols-2">
              {top.map(({ country, battles }) => (
                <li
                  key={country}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3.5 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-body-sm font-bold">
                    <Flag code={country} size="bare" />
                    <span className="truncate">
                      {countryName(country, i18n.language)}
                    </span>
                  </span>
                  <span className="shrink-0 text-body-sm text-muted">
                    {t("landing.counts.battleCount", { count: battles })}
                  </span>
                </li>
              ))}
            </ol>
            {more > 0 && (
              <p className="text-body-sm text-muted">
                {t("landing.counts.more", { count: more })}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <dt className="text-label text-muted uppercase">{label}</dt>
      <dd className="font-display text-display-md">{value}</dd>
    </div>
  );
}
