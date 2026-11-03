import { WarningCircle } from "@phosphor-icons/react";
import { useId } from "react";

/** One chip: its text, whether it is lit, and what tapping it does. */
export type Chip = {
  key: string;
  label: string;
  on: boolean;
  onPick: () => void;
};

/**
 * A labelled row of choice chips (DESIGN.md §4.35, battle sheet): presets in the battle sheet,
 * several at once for a dancer's titles. A lit chip is pressed.
 */
export function ChipRow({
  label,
  hint,
  error,
  chips,
}: {
  label: string;
  hint?: string;
  error?: string;
  chips: Chip[];
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      aria-describedby={hint ? `${id}-hint` : undefined}
      className="flex flex-col gap-2"
    >
      <span id={id} className="text-label text-text uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={chip.on}
            onClick={chip.onPick}
            className={`h-11 cursor-pointer rounded-full border px-4 text-body-sm font-semibold whitespace-nowrap transition-colors duration-fast ${
              chip.on
                ? "border-primary bg-primary text-on-primary"
                : "border-border-strong bg-surface text-text hover:bg-surface-raised"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="flex items-center gap-1 text-caption font-bold text-danger">
          <WarningCircle size={14} weight="bold" aria-hidden />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-caption text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
