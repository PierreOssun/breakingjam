import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { Flag } from "../../components/Flag";
import { countryName } from "../../lib/countries";

/** How many countries get a chip before "+N more". */
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

// §4.10 country count chip; the "+N more" chip has no flag, so it pads both sides alike.
const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-bg pr-3 text-body-sm";

/** "The scene so far": battles, countries and dancers, then the busiest countries (§6). */
export function SceneSoFar() {
  const { t, i18n } = useTranslation();
  const stats = useSiteStats().data;
  if (!stats) return null;
  const number = new Intl.NumberFormat(i18n.language);
  const counts = [
    {
      value: stats.battles,
      label: t("landing.scene.battles", { count: stats.battles }),
    },
    {
      value: stats.countries,
      label: t("landing.scene.countries", { count: stats.countries }),
    },
    {
      value: stats.dancers,
      label: t("landing.scene.dancers", { count: stats.dancers }),
    },
  ];
  const top = stats.battles_by_country.slice(0, TOP_COUNTRIES);
  const more = stats.battles_by_country.length - top.length;

  return (
    <section
      aria-labelledby="scene-title"
      className="border-t border-border py-10 lg:py-20"
    >
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 md:px-6 lg:gap-8 lg:px-8">
        <h2 id="scene-title" className="text-label text-primary-text uppercase">
          {t("landing.scene.title")}
        </h2>
        {/* Phones: a 3-cell stats strip (§4.15); from lg, one line of big numbers joined by "·". */}
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border lg:flex lg:flex-wrap lg:items-baseline lg:gap-x-5 lg:gap-y-2 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent">
          {counts.map((count) => (
            <div
              key={count.label}
              className="flex flex-col items-center bg-surface px-1.5 py-3 text-center lg:flex-row lg:items-baseline lg:gap-3 lg:bg-transparent lg:p-0 lg:not-first:before:mr-2 lg:not-first:before:text-display-xl lg:not-first:before:text-muted lg:not-first:before:content-['·']"
            >
              <dt className="order-2 text-caption text-muted lg:text-body-lg">
                {count.label}
              </dt>
              <dd className="font-display text-stat lg:text-display-xl">
                {number.format(count.value)}
              </dd>
            </div>
          ))}
        </dl>
        {top.length > 0 && (
          <ul
            aria-label={t("landing.scene.byCountry")}
            className="flex flex-wrap gap-2"
          >
            {top.map(({ country, battles }) => (
              <li key={country} className={`${chip} pl-2`}>
                {/* The name follows in text, so the flag stays out of the way. */}
                <span aria-hidden className="inline-flex">
                  <Flag code={country} size="bare" />
                </span>
                <span className="font-extrabold">
                  {countryName(country, i18n.language)}
                </span>
                <span className="font-bold text-muted">
                  {number.format(battles)}
                </span>
              </li>
            ))}
            {more > 0 && (
              <li className={`${chip} pl-3 font-bold text-muted`}>
                {t("landing.scene.more", { count: more })}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
