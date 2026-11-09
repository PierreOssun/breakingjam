import type { TFunction } from "i18next";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { Schemas } from "../../api/client";
import { splitFieldErrors } from "../../lib/apiErrors";

/** The API sends one code a minute per account (M27): Resend waits as long. */
export const RESEND_SECONDS = 60;

/** What sign-up, log-in and Forgot password hand the code pages: `{ email }` in the navigation state. */
export type CodeState = { email?: string } | null;

/** The language the code emails are written in: the site's own. */
export function useMailLanguage(): Schemas["Language"] {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  return language === "fr" || language === "de" ? language : "en";
}

/** A code arrives as 6 digits; the API stays the judge of whether it is right. */
export function codeSchema(t: TFunction) {
  return z
    .string()
    .trim()
    .regex(/^\d{6}$/, t("auth.code.invalid"));
}

/**
 * Puts the API's field errors on the form, a wrong, expired or used-up code in the site's words;
 * false when it named no field.
 */
export function showCodeErrors<Values extends FieldValues>(
  setError: UseFormSetError<Values>,
  envelope: Schemas["ErrorEnvelope"] | undefined,
  known: readonly Path<Values>[],
  t: TFunction,
): boolean {
  const { fields } = splitFieldErrors(envelope, known);
  for (const [name, message] of fields)
    setError(name, {
      message: name === "code" ? t("auth.code.wrong") : message,
    });
  return fields.length > 0;
}
