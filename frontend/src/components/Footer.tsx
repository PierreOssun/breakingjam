import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "./LanguageSwitch";
import { Wordmark } from "./Wordmark";

/** Content-page footer: wordmark, tagline and the language switch (§6 landing). */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-2 text-body-sm text-muted">{t("footer.tagline")}</p>
        </div>
        <LanguageSwitch placement="up" />
      </div>
    </footer>
  );
}
