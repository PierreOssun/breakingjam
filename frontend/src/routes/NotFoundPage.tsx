import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../components/buttonClasses";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto flex max-w-prose flex-col items-start gap-4 px-4 py-10 md:px-6 lg:py-20">
      <h1 className="font-display text-display-lg lg:text-display-xl">
        {t("notFound.title")}
      </h1>
      <p className="text-body-lg text-muted">{t("notFound.body")}</p>
      <Link to="/" className={buttonClasses("secondary", "md")}>
        {t("notFound.action")}
      </Link>
    </section>
  );
}
