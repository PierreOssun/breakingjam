import { type KeyboardEvent, type PointerEvent, useRef } from "react";

type Days = [number, number];

type RangeSliderProps = {
  /** From and To as day numbers, 0 … `max`. */
  value: Days;
  max: number;
  /** The handles' names: "From", "To". */
  labels: [string, string];
  /** A day as people read it, for screen readers. */
  valueText: (day: number) => string;
  /** The day `months` later (earlier when negative): Page Up and Page Down. */
  monthsFrom: (day: number, months: number) => number;
  /** While a handle is dragged. */
  onInput: (value: Days) => void;
  /** Once a drag ends, or on each key. */
  onCommit: (value: Days) => void;
};

/** The handle of a slider: 0 for From, 1 for To. */
type Handle = 0 | 1;

/**
 * Two handles on one track (DESIGN.md §4.48), built by hand: two stacked range inputs can't
 * give Page Up/Down a month. They never cross, and keep a day between them.
 */
export function RangeSlider({
  value,
  max,
  labels,
  valueText,
  monthsFrom,
  onInput,
  onCommit,
}: RangeSliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const handles = useRef<(HTMLDivElement | null)[]>([]);
  const dragged = useRef<{ handle: Handle; value: Days } | null>(null);
  const [from, to] = value;

  const moved = (handle: Handle, day: number, [from, to]: Days): Days =>
    handle === 0
      ? [Math.max(0, Math.min(day, to - 1)), to]
      : [from, Math.min(max, Math.max(day, from + 1))];

  function dayAt(clientX: number): number {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    const share = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return Math.round(share * max);
  }

  // The nearest handle takes the pointer; outside the selection, the one on that side.
  function nearest(day: number): Handle {
    if (day <= from) return 0;
    if (day >= to) return 1;
    return day - from < to - day ? 0 : 1;
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const day = dayAt(event.clientX);
    const handle = nearest(day);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    handles.current[handle]?.focus();
    const next = moved(handle, day, value);
    dragged.current = { handle, value: next };
    onInput(next);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const drag = dragged.current;
    if (!drag) return;
    const next = moved(drag.handle, dayAt(event.clientX), drag.value);
    if (next[0] === drag.value[0] && next[1] === drag.value[1]) return;
    drag.value = next;
    onInput(next);
  }

  function end() {
    const drag = dragged.current;
    if (!drag) return;
    dragged.current = null;
    onCommit(drag.value);
  }

  function key(handle: Handle, event: KeyboardEvent<HTMLDivElement>) {
    const day = value[handle];
    const target = {
      ArrowLeft: day - 1,
      ArrowDown: day - 1,
      ArrowRight: day + 1,
      ArrowUp: day + 1,
      PageDown: monthsFrom(day, -1),
      PageUp: monthsFrom(day, 1),
      Home: 0,
      End: max,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    onCommit(moved(handle, target, value));
  }

  const at = (day: number) => `${(max === 0 ? 0 : day / max) * 100}%`;
  return (
    // 14px each side: a handle at either end stays inside the card.
    <div className="px-3.5">
      <div
        ref={track}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="relative h-11 cursor-pointer touch-none select-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: at(from), right: `calc(100% - ${at(to)})` }}
        />
        {value.map((day, i) => {
          const handle = i as Handle;
          return (
            <div
              key={handle}
              ref={(element) => {
                handles.current[handle] = element;
              }}
              role="slider"
              tabIndex={0}
              aria-label={labels[handle]}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={day}
              aria-valuetext={valueText(day)}
              onKeyDown={(event) => key(handle, event)}
              // A 44px touch area around the 28px knob (§8).
              className="group absolute top-0 grid size-11 -translate-x-1/2 place-items-center rounded-full outline-none"
              style={{ left: at(day) }}
            >
              <span className="size-7 rounded-full border-[3px] border-primary bg-surface-raised shadow-sm group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus group-focus-visible:outline-solid" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
