import { CalendarBlank, CaretUp } from "@phosphor-icons/react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dayAndMonth } from "../../lib/dates";
import {
  addDays,
  addMonths,
  dayLabel,
  daysBetween,
  lastDay,
  PRESETS,
  presetOf,
  presetRange,
  type Range,
  meet,
  rangeLabel,
  sliderMonths,
} from "./range";
import { RangeSlider } from "./RangeSlider";

/** How often a drag updates the map, the list and the count. */
const THROTTLE_MS = 150;

type DateCardProps = {
  range: Range;
  /** The viewer's date, `YYYY-MM-DD`. */
  today: string;
  /** Jams in view in each of the slider's months, whatever the range: the bars. */
  months: number[];
  /** Jams in view in the range. */
  count: number;
  /** While a handle is dragged, about every 150 ms. */
  onDrag: (range: Range) => void;
  /** Once a drag ends, a date is picked or a preset is tapped. */
  onChange: (range: Range) => void;
  /** Phones: the drag handle on top, which folds the card back into its pill. */
  onCollapse?: () => void;
};

/**
 * The map's From and To (DESIGN.md §4.48): the dates with the count, a bar per month, the
 * two-handle slider over the next 12 months, then the presets.
 */
export function DateCard({
  range,
  today,
  months,
  count,
  onDrag,
  onChange,
  onCollapse,
}: DateCardProps) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<Range | null>(null);
  const shown = draft ?? range;
  const last = lastDay(today);
  const total = daysBetween(today, last);
  const preset = presetOf(shown, today);

  // A drag sends its latest range at most every THROTTLE_MS, then once more on release.
  const timer = useRef<number | null>(null);
  const pending = useRef<Range | null>(null);
  const stopTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);

  const rangeAt = ([from, to]: [number, number]): Range => ({
    from: addDays(today, from),
    to: addDays(today, to),
  });
  function drag(days: [number, number]) {
    const next = rangeAt(days);
    setDraft(next);
    pending.current = next;
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (pending.current) onDrag(pending.current);
    }, THROTTLE_MS);
  }
  function commit(next: Range) {
    stopTimer();
    pending.current = null;
    setDraft(null);
    onChange(next);
  }

  const now = t("map.dates.now");
  const label = (day: string) => dayLabel(day, today, i18n.language, now);
  // Where a day sits along the track, as a share of its width.
  const share = (day: string) => daysBetween(today, day) / total;
  const busiest = Math.max(1, ...months);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-strong bg-surface-raised px-3 pt-2 pb-4 shadow-lg sm:px-4">
      {onCollapse && (
        <Grip onCollapse={onCollapse} label={t("map.dates.hide")} />
      )}
      <div className="flex items-center gap-1.5 pt-2 sm:gap-2">
        {/* Below 360px the dates and the count need its room. */}
        <CalendarBlank
          size={18}
          weight="bold"
          aria-hidden
          className="hidden shrink-0 text-primary-text min-[360px]:block"
        />
        <DateButton
          name={t("map.dates.from")}
          text={label(shown.from)}
          value={shown.from}
          min={today}
          max={addDays(shown.to, -1)}
          onPick={(from) => commit({ ...shown, from })}
        />
        <span aria-hidden className="text-muted">
          –
        </span>
        <DateButton
          name={t("map.dates.to")}
          text={label(shown.to)}
          value={shown.to}
          min={addDays(shown.from, 1)}
          max={last}
          onPick={(to) => commit({ ...shown, to })}
        />
        <span className="ml-auto shrink-0 text-body-sm font-bold whitespace-nowrap text-primary-text">
          {count === 0 ? t("map.dates.none") : t("map.dates.jams", { count })}
        </span>
      </div>

      <div aria-hidden className="px-3.5">
        <div className="relative h-7">
          {sliderMonths(today).map((month, i) => (
            <span
              key={month.from}
              className={`absolute bottom-0 rounded-t-sm ${meet(month, shown) ? "bg-primary/50" : "bg-border"}`}
              style={{
                left: `calc(${share(month.from) * 100}% + 1px)`,
                width: `calc(${(share(addDays(month.to, 1)) - share(month.from)) * 100}% - 2px)`,
                height: `max(2px, ${((months[i] ?? 0) / busiest) * 100}%)`,
              }}
            />
          ))}
        </div>
      </div>

      <RangeSlider
        value={[daysBetween(today, shown.from), daysBetween(today, shown.to)]}
        max={total}
        labels={[t("map.dates.from"), t("map.dates.to")]}
        valueText={(day) => label(addDays(today, day))}
        monthsFrom={(day, by) =>
          daysBetween(today, addMonths(addDays(today, day), by))
        }
        onInput={drag}
        onCommit={(days) => commit(rangeAt(days))}
      />

      <div aria-hidden className="relative -mt-2 h-4 px-3.5">
        <div className="relative h-full">
          {[0, 2, 4, 6, 8, 10, 12].map((i) => {
            const day = addMonths(today, i);
            // Centred under the handle's place: the track's side padding holds the ends.
            return (
              <span
                key={i}
                className="absolute top-0 -translate-x-1/2 text-caption whitespace-nowrap text-muted"
                style={{ left: `${share(day) * 100}%` }}
              >
                {dayAndMonth(day, i18n.language).month}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-1 grid grid-cols-4 gap-1.5 sm:gap-2">
        {PRESETS.map((months) => (
          <button
            key={months}
            type="button"
            aria-pressed={preset === months}
            onClick={() => commit(presetRange(months, today))}
            className={`h-11 cursor-pointer rounded-full border px-1 text-caption font-semibold whitespace-nowrap min-[360px]:text-body-sm transition-colors duration-fast ${preset === months ? "border-text bg-text text-bg" : "border-border-strong text-text hover:bg-surface"}`}
          >
            {t(`map.dates.preset.${months}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** From or To: the day, opening the native date picker for an exact one. */
function DateButton({
  name,
  text,
  value,
  min,
  max,
  onPick,
}: {
  name: string;
  text: string;
  value: string;
  min: string;
  max: string;
  onPick: (day: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  function open() {
    const field = input.current;
    if (!field) return;
    // Safari before 16.4 has no showPicker: focusing the field lets it open its own.
    if (typeof field.showPicker === "function") field.showPicker();
    else field.focus();
  }
  return (
    <span className="relative">
      <button
        type="button"
        onClick={open}
        className="h-11 cursor-pointer rounded-md border border-border-strong bg-surface px-2.5 text-body-sm font-bold whitespace-nowrap text-text transition-colors duration-fast hover:bg-surface-raised"
      >
        <span className="sr-only">{`${name}: `}</span>
        {text}
      </button>
      <input
        ref={input}
        type="date"
        aria-label={name}
        aria-hidden
        tabIndex={-1}
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const day = event.target.value;
          if (day >= min && day <= max) onPick(day);
        }}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </span>
  );
}

/** The bar on top of the card on phones: a tap or a swipe down folds it. */
function Grip({
  onCollapse,
  label,
}: {
  onCollapse: () => void;
  label: string;
}) {
  const startY = useRef<number | null>(null);
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded
      onClick={onCollapse}
      onPointerDown={(event: PointerEvent) => {
        startY.current = event.clientY;
      }}
      onPointerUp={(event: PointerEvent) => {
        if (startY.current !== null && event.clientY - startY.current > 24)
          onCollapse();
        startY.current = null;
      }}
      className="-mx-3 -mt-2 flex h-6 sm:-mx-4 cursor-pointer touch-none justify-center pt-2"
    >
      <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
    </button>
  );
}

/** Phones, folded: the range on a pill at the bottom of the map; a tap opens the card. */
export function DatePill({
  range,
  today,
  onOpen,
}: {
  range: Range;
  today: string;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const preset = presetOf(range, today);
  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={onOpen}
      className="flex h-[52px] w-full cursor-pointer items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 text-left text-body-sm font-bold text-text shadow-lg"
    >
      <CalendarBlank
        size={18}
        weight="bold"
        aria-hidden
        className="shrink-0 text-primary-text"
      />
      <span className="truncate">
        {rangeLabel(range, today, i18n.language, t("map.dates.now"))}
      </span>
      {preset && (
        <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-border px-2.5 text-caption font-bold text-muted">
          {t(`map.dates.preset.${preset}`)}
        </span>
      )}
      <CaretUp
        size={18}
        weight="bold"
        aria-hidden
        className="ml-auto shrink-0"
      />
    </button>
  );
}
