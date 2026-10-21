import type { ComponentProps, ReactNode } from "react";
import { Field } from "./Field";

type TextFieldProps = ComponentProps<"input"> & {
  label: ReactNode;
  hint?: string;
  error?: string;
};

/** A text input in the field stack of DESIGN.md §4.2. */
export function TextField({
  label,
  hint,
  error,
  id,
  className,
  ...input
}: TextFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={className}
    >
      {(control) => (
        <input
          {...control}
          className="h-12 w-full rounded-md border border-border-strong bg-surface px-3.5 text-body text-text transition-colors duration-fast placeholder:text-muted focus-visible:border-text disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-danger"
          {...input}
        />
      )}
    </Field>
  );
}
