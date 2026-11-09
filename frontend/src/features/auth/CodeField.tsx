import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/TextField";

/** The 6-digit code input, filled in by the phone's keyboard suggestion where it offers one. */
export function CodeField(
  props: Omit<ComponentProps<typeof TextField>, "label">,
) {
  const { t } = useTranslation();
  return (
    <TextField
      label={t("auth.code.label")}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      {...props}
    />
  );
}
