import { WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { beyondWelcome, withNext } from "./safeNext";

type AuthShellProps = {
  title: string;
  /** Form-level error, announced when it appears. */
  error?: string;
  children: ReactNode;
  /** "New here? Create an account" and the like. */
  footer: ReactNode;
};

/** Shared frame of the account pages (log in, sign up, codes): title, error, form, switch link. */
export function AuthShell({ title, error, children, footer }: AuthShellProps) {
  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
      <title>{`${title} · BreakingJam`}</title>
      <h1 className="font-display text-display-lg lg:text-display-xl">
        {title}
      </h1>
      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 text-body-sm font-bold text-danger"
        >
          <WarningCircle size={20} weight="bold" aria-hidden />
          {error}
        </p>
      )}
      {children}
      <p className="text-body-sm text-muted">{footer}</p>
    </section>
  );
}

/** The code pages' way out: "Back to log in", keeping `next`, but not a sign-up's welcome step. */
export function BackToLogin({ next }: { next: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={withNext("/login", beyondWelcome(next))}
      className="font-bold text-primary-text underline"
    >
      {t("auth.code.backToLogin")}
    </Link>
  );
}
