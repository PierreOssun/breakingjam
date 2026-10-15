import { CaretDown, WarningCircle } from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useId } from "react";

type SelectFieldProps = ComponentProps<"select"> & {
  label: ReactNode;
  hint?: string;
  error?: string;
};

/** A native select with the field stack of DESIGN.md §4.2; never a custom one (v1). */
export function SelectField({
  label,
  hint,
  error,
  id,
  className = "",
  children,
  ...select
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const noteId = `${selectId}-note`;
  const note = error ?? hint;
  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={selectId} className="mb-2 text-label text-text uppercase">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className="h-12 w-full appearance-none rounded-md border border-border-strong bg-surface pr-10 pl-3.5 text-body text-text transition-colors duration-fast focus-visible:border-text disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-danger"
          {...select}
        >
          {children}
        </select>
        <CaretDown
          size={20}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        />
      </div>
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
