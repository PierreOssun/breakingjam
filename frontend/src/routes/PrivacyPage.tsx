import { useTranslation } from "react-i18next";
import { CONTACT_EMAIL, mailtoUs } from "../lib/contact";
import { useMetaDescription } from "../lib/useMetaDescription";

/** `/privacy`: what the site keeps about people, why, and how to have it changed (DESIGN.md §6). */
export function PrivacyPage() {
  const { t } = useTranslation();
  useMetaDescription(t("privacy.intro"));
  const sections: { title: string; body: string[] }[] = t("privacy.sections", {
    returnObjects: true,
  });
  return (
    <div className="mx-auto flex max-w-prose flex-col gap-8 px-4 pt-8 pb-16 md:px-6 lg:py-20">
      <title>{`${t("pages.privacy")} · BreakingJam`}</title>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg lg:text-display-xl">
          {t("privacy.title")}
        </h1>
        <p className="text-body text-muted">{t("privacy.intro")}</p>
        <p className="text-caption text-muted">{t("privacy.updated")}</p>
      </header>
      {sections.map(({ title, body }) => (
        <section key={title} className="flex flex-col gap-2">
          <h2 className="font-display text-display-xs">{title}</h2>
          {body.map((line) => (
            <p key={line} className="text-body">
              {line}
            </p>
          ))}
        </section>
      ))}
      <p className="text-body">
        {t("privacy.contact")}{" "}
        <a
          href={mailtoUs()}
          className="font-bold break-all text-primary-text underline-offset-2 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
