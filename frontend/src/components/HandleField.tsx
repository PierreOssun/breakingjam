import type { ComponentProps, ReactNode } from "react";
import { Field } from "./Field";

type HandleFieldProps = ComponentProps<"input"> & {
  label: ReactNode;
  error?: string;
};

/** An Instagram handle after a fixed `@` (DESIGN.md §4.20 prefixed input). */
export function HandleField({ label, error, id, ...input }: HandleFieldProps) {
  return (
    <Field id={id} label={label} error={error}>
      {(control) => (
        <div className="flex h-12 items-center rounded-md border border-border-strong bg-surface focus-within:border-text has-aria-invalid:border-danger has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid">
          <span aria-hidden className="pl-3.5 font-bold text-muted">
            @
          </span>
          <input
            {...control}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent pr-3.5 pl-1 text-body text-text outline-none"
            {...input}
          />
        </div>
      )}
    </Field>
  );
}
