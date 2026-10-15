import { WarningCircle } from "@phosphor-icons/react";
import { useId, type ComponentProps } from "react";

type TextFieldProps = ComponentProps<"input"> & {
  label: string;
  /** Shown under the field; replaced by `error` when there is one. */
  hint?: string;
  error?: string;
};

/** Label → input → hint or error, linked for screen readers (DESIGN.md §4.2). */
export function TextField({
  label,
  hint,
  error,
  id,
  className = "",
  ...input
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;

  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={inputId} className="mb-2 text-label text-text uppercase">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className="h-12 w-full rounded-md border border-border-strong bg-surface px-3.5 text-body text-text transition-colors duration-fast placeholder:text-muted focus-visible:border-text disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-danger"
        {...input}
      />
      {error ? (
        <p
          id={noteId}
          className="mt-2 flex items-center gap-1 text-caption font-bold text-danger"
        >
          <WarningCircle size={14} weight="bold" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-2 text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
