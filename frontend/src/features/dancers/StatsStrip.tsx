import { useTranslation } from "react-i18next";
import type { DancerStats } from "./stats";

/** Jams, countries, years active, podiums; gone entirely when all are 0 (DESIGN.md §4.15). */
export function StatsStrip({ stats }: { stats: DancerStats }) {
  const { t } = useTranslation();
  if (Object.values(stats).every((value) => value === 0)) return null;
  const cells = [
    { value: stats.jams, label: t("dancer.stats.jams", { count: stats.jams }) },
    {
      value: stats.countries,
      label: t("dancer.stats.countries", { count: stats.countries }),
    },
    {
      value: stats.years,
      label: t("dancer.stats.years", { count: stats.years }),
    },
    {
      value: stats.podiums,
      label: t("dancer.stats.podiums", { count: stats.podiums }),
    },
  ];
  return (
    <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-2">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="flex flex-col items-center bg-surface px-1.5 py-3 text-center"
        >
          <dt className="order-2 text-caption text-muted">{cell.label}</dt>
          <dd className="font-display text-stat">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
