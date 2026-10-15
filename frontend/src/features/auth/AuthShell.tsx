import { GoogleLogo, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { API_ORIGIN } from "../../api/client";
import { buttonClasses } from "../../components/buttonClasses";
import { withNext } from "./safeNext";

type AuthShellProps = {
  title: string;
  /** Same-site path to land on afterwards; also passed to Google. */
  next: string;
  /** Form-level error, announced when it appears. */
  error?: string;
  children: ReactNode;
  /** "New here? Create an account" and the like. */
  footer: ReactNode;
};

/** Shared frame of the login and register pages: title, form, Google, switch link. */
export function AuthShell({
  title,
  next,
  error,
  children,
  footer,
}: AuthShellProps) {
  const { t } = useTranslation();
  // A full navigation, not a fetch: the API answers with a redirect to Google (§5 Auth).
  const google = withNext(`${API_ORIGIN}/api/auth/google`, next);

  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
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
      <div className="flex items-center gap-4 text-label text-muted uppercase">
        <span className="h-px flex-1 bg-border" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <a href={google} className={`${buttonClasses("secondary", "md")} w-full`}>
        <GoogleLogo size={20} weight="bold" aria-hidden />
        {t("auth.google")}
      </a>
      <p className="text-body-sm text-muted">{footer}</p>
    </section>
  );
}
