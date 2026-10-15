import { X } from "@phosphor-icons/react";
import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";

type ChipInputProps = {
  label: ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  hint: string;
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
  hint,
}: ChipInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().replace(/,$/, "").trim();
    if (value && values.length < max && !values.includes(value)) {
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
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-2 text-label text-text uppercase">
        {label}
      </label>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-md border border-border-strong bg-surface p-2 focus-within:border-text has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface-raised pr-1 pl-3 text-body-sm font-bold"
          >
            {value}
            <button
              type="button"
              aria-label={t("picker.remove", { name: value })}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-surface"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </span>
        ))}
        {values.length < max && (
          <input
            id={id}
            value={draft}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={add}
            // The ring is drawn on the field shell instead (§8).
            className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-body text-text outline-none"
          />
        )}
      </div>
      <p id={`${id}-hint`} className="mt-2 text-caption text-muted">
        {hint}
      </p>
    </div>
  );
}
