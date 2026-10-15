import { useTranslation } from "react-i18next";
import { dayAndMonth } from "../lib/dates";

/** Day over short month, the start of a jam row (DESIGN.md §4.14); the row says the full date. */
export function DateBlock({ date }: { date: string }) {
  const { i18n } = useTranslation();
  const { day, month } = dayAndMonth(date, i18n.language);
  return (
    <div
      aria-hidden
      className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-md border border-border bg-surface"
    >
      <span className="font-display text-[18px] leading-[22px] font-extrabold">
        {day}
      </span>
      <span className="text-[11px] font-extrabold tracking-[0.06em] text-primary-text uppercase">
        {month}
      </span>
    </div>
  );
}
