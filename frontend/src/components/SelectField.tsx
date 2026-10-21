import { CaretDown } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { Field } from "./Field";

type SelectFieldProps = ComponentProps<"select"> & {
  label: ReactNode;
  hint?: string;
  error?: string;
};

/** A native select in the field stack of DESIGN.md §4.2; never a custom one (v1). */
export function SelectField({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...select
}: SelectFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={className}
    >
      {(control) => (
        <div className="relative">
          <select
            {...control}
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
      )}
    </Field>
  );
}
