import { GoogleLogo } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { API_ORIGIN } from "../../api/client";
import { buttonClasses } from "../../components/buttonClasses";
import { withNext } from "./safeNext";

/** "or", then Continue with Google, landing on `next` afterwards (log in and sign up). */
export function GoogleSignIn({ next }: { next: string }) {
  const { t } = useTranslation();
  // A full navigation, not a fetch: the API answers with a redirect to Google (§5 Auth).
  const google = withNext(`${API_ORIGIN}/api/auth/google`, next);
  return (
    <>
      <div className="flex items-center gap-4 text-label text-muted uppercase">
        <span className="h-px flex-1 bg-border" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <a href={google} className={`${buttonClasses("secondary", "md")} w-full`}>
        <GoogleLogo size={20} weight="bold" aria-hidden />
        {t("auth.google")}
      </a>
    </>
  );
}
