import { WarningCircle } from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useId } from "react";

type HandleFieldProps = ComponentProps<"input"> & {
  label: ReactNode;
  error?: string;
};

/** An Instagram handle after a fixed `@` (DESIGN.md §4.20 prefixed input). */
export function HandleField({ label, error, id, ...input }: HandleFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col">
      <label htmlFor={inputId} className="mb-2 text-label text-text uppercase">
        {label}
      </label>
      <div className="flex h-12 items-center rounded-md border border-border-strong bg-surface focus-within:border-text has-aria-invalid:border-danger has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid">
        <span aria-hidden className="pl-3.5 font-bold text-muted">
          @
        </span>
        <input
          id={inputId}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent pr-3.5 pl-1 text-body text-text outline-none"
          {...input}
        />
      </div>
      {error && (
        <p
          id={`${inputId}-error`}
          className="mt-2 flex items-center gap-1 text-caption font-bold text-danger"
        >
          <WarningCircle size={14} weight="bold" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
