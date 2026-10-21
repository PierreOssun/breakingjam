import { WarningCircle } from "@phosphor-icons/react";
import { type ReactNode, useId } from "react";

/** What the control inside a `Field` spreads, so the label and note are linked to it. */
export type Control = {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

type FieldProps = {
  id?: string;
  label: ReactNode;
  /** Shown under the field; replaced by `error` when there is one. */
  hint?: string;
  error?: string;
  /** Shows "n / max" at the right of the note, red past the limit (DESIGN.md §4.20). */
  counter?: { length: number; max: number };
  className?: string;
  children: (control: Control) => ReactNode;
};

/** Label → control → hint or error, linked for screen readers (DESIGN.md §4.2). */
export function Field({
  id,
  label,
  hint,
  error,
  counter,
  className = "",
  children,
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const noteId = `${fieldId}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={fieldId} className="mb-2 text-label text-text uppercase">
        {label}
      </label>
      {children({
        id: fieldId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": note ? noteId : undefined,
      })}
      {(note || counter) && (
        <div className="mt-2 flex gap-3">
          {error ? (
            <p
              id={noteId}
              className="flex flex-1 items-center gap-1 text-caption font-bold text-danger"
            >
              <WarningCircle size={14} weight="bold" aria-hidden />
              {error}
            </p>
          ) : (
            <p id={noteId} className="flex-1 text-caption text-muted">
              {hint}
            </p>
          )}
          {counter && (
            <p
              className={`text-caption ${counter.length > counter.max ? "font-bold text-danger" : "text-muted"}`}
            >
              {counter.length} / {counter.max}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
