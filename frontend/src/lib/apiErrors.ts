import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { Schemas } from "../api/client";

type Envelope = Schemas["ErrorEnvelope"] | undefined;

/**
 * Server messages for fields the form shows, and whatever is left for the form-level
 * error: the server stays authoritative when the client checks miss a rule (§6 Forms).
 */
export function splitFieldErrors<Field extends string>(
  envelope: Envelope,
  known: readonly Field[],
): { fields: [Field, string][]; rest: string | null } {
  // A proxy's HTML page or an empty body arrives as text, not as the envelope.
  if (typeof envelope !== "object") envelope = undefined;
  const fields: [Field, string][] = [];
  const rest: string[] = [];
  for (const { field, message } of envelope?.error.fields ?? []) {
    const name = known.find((k) => k === field);
    if (name) fields.push([name, message]);
    else rest.push(message);
  }
  const message = envelope?.error.message ?? null;
  return {
    fields,
    rest: rest.length > 0 ? rest.join(" ") : fields.length > 0 ? null : message,
  };
}

/**
 * Puts the server's messages on the form: known fields where they belong, the rest on
 * `root`. `rename` maps a server field onto the form field that stands for it.
 */
export function applyFieldErrors<Values extends FieldValues>(
  setError: UseFormSetError<Values>,
  envelope: Envelope,
  known: readonly string[],
  rename: Record<string, Path<Values>> = {},
) {
  const { fields, rest } = splitFieldErrors(envelope, known);
  for (const [field, message] of fields)
    setError(rename[field] ?? (field as Path<Values>), { message });
  if (rest) setError("root", { message: rest });
}
