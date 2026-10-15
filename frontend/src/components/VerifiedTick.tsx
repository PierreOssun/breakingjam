import { Check, Seal } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** The only mark a dancer can carry: a primary seal with a white check (DESIGN.md §4.16). */
export function VerifiedTick() {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={t("dancer.verified")}
      className="relative inline-flex size-6 shrink-0 items-center justify-center"
    >
      <Seal
        size={24}
        weight="fill"
        className="absolute inset-0 text-primary"
        aria-hidden
      />
      <Check
        size={12}
        weight="bold"
        className="relative text-on-primary"
        aria-hidden
      />
    </span>
  );
}
