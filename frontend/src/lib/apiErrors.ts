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
