import { useTranslation } from "react-i18next";
import type en from "../i18n/en.json";

type PageKey = `pages.${Exclude<keyof typeof en.pages, "comingSoon">}`;

/** Stand-in for pages built in later milestones (M10–M12). */
export function ComingSoon({ title }: { title: PageKey }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-content px-4 py-10 md:px-6 lg:px-8 lg:py-20">
      <h1 className="font-display text-display-lg lg:text-display-xl">
        {t(title)}
      </h1>
      <p className="mt-4 text-body-lg text-muted">{t("pages.comingSoon")}</p>
    </section>
  );
}
