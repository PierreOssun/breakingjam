import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { Field } from "./Field";
import { RemovableChip } from "./RemovableChip";

type ChipInputProps = {
  label: ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  /** The longest a value may be. */
  maxLength: number;
  hint: string;
  error?: string;
};

/**
 * Several short values in one field (DESIGN.md §4.20): Enter or comma adds, Backspace on an
 * empty input removes the last one.
 */
export function ChipInput({
  label,
  values,
  onChange,
  max,
  maxLength,
  hint,
  error,
}: ChipInputProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().replace(/,$/, "").trim();
    // "Rocket" and "rocket" are one alias.
    const known = values.some((v) => v.toLowerCase() === value.toLowerCase());
    if (value && values.length < max && !known) {
      onChange([...values, value]);
    }
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(control) => (
        <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface p-2 focus-within:border-text has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid">
          {values.map((value) => (
            <RemovableChip
              key={value}
              name={value}
              className="max-w-full"
              onRemove={() => {
                onChange(values.filter((v) => v !== value));
                // The ✕ leaves with its chip: focus goes on to the input, not nowhere.
                input.current?.focus();
              }}
            />
          ))}
          {/* Kept when full, read-only: it holds the focus, and Backspace still removes. */}
          <input
            ref={input}
            {...control}
            value={draft}
            maxLength={maxLength}
            readOnly={values.length >= max}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={add}
            // The ring is drawn on the field shell instead (§8).
            className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-body text-text outline-none"
          />
        </div>
      )}
    </Field>
  );
}
