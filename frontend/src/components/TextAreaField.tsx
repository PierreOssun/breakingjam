import { WarningCircle } from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useId } from "react";

type TextAreaFieldProps = ComponentProps<"textarea"> & {
  label: ReactNode;
  hint?: string;
  error?: string;
  /** Shows "n / max", red past the limit (DESIGN.md §4.20). */
  counter?: { length: number; max: number };
};

/** A textarea in the input shell, with an optional character counter. */
export function TextAreaField({
  label,
  hint,
  error,
  counter,
  id,
  className = "",
  ...textarea
}: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const noteId = `${fieldId}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={fieldId} className="mb-2 text-label text-text uppercase">
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className="min-h-24 w-full resize-none rounded-md border border-border-strong bg-surface px-3.5 py-3 text-body text-text transition-colors duration-fast placeholder:text-muted focus-visible:border-text aria-invalid:border-danger"
        {...textarea}
      />
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
    </div>
  );
}
