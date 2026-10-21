import type { ComponentProps, ReactNode } from "react";
import { Field } from "./Field";

type TextAreaFieldProps = ComponentProps<"textarea"> & {
  label: ReactNode;
  hint?: string;
  error?: string;
  counter?: { length: number; max: number };
};

/** A textarea in the field stack, with an optional character counter (DESIGN.md §4.20). */
export function TextAreaField({
  label,
  hint,
  error,
  counter,
  id,
  className,
  ...textarea
}: TextAreaFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      counter={counter}
      className={className}
    >
      {(control) => (
        <textarea
          {...control}
          className="min-h-24 w-full resize-none rounded-md border border-border-strong bg-surface px-3.5 py-3 text-body text-text transition-colors duration-fast placeholder:text-muted focus-visible:border-text aria-invalid:border-danger"
          {...textarea}
        />
      )}
    </Field>
  );
}
