import { useTranslation } from "react-i18next";
import type { Countdown } from "./jamDetail";

/** "In 9 days", "Tomorrow", "Today", "Live now", next to the status badge (DESIGN.md §4.30). */
export function CountdownChip({ value }: { value: Countdown }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-primary-text/50 bg-primary/[.12] px-2.5 text-caption font-extrabold text-primary-text uppercase">
      {value.key === "days"
        ? t("jam.countdown.days", { count: value.count })
        : t(`jam.countdown.${value.key}`)}
    </span>
  );
}
