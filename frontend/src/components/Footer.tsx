import { InstagramLogo } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BREAKINGJAM_INSTAGRAM } from "../lib/instagram";
import { buttonClasses } from "./buttonClasses";
import { LanguageSwitch } from "./LanguageSwitch";
import { Wordmark } from "./Wordmark";

const link = buttonClasses("ghost", "sm");

/** Content-page footer: the round logo, the main links, the language (§6). */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-4 py-10 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Wordmark logo="round" />
        <nav
          aria-label={t("footer.links")}
          className="-mx-[18px] flex flex-col items-start lg:mx-0 lg:flex-row lg:items-center lg:gap-1"
        >
          <Link to="/jams" className={link}>
            {t("nav.findJam")}
          </Link>
          <Link to="/dancers" className={link}>
            {t("nav.findSomeone")}
          </Link>
          <Link to="/org/jams/new" className={link}>
            {t("nav.registerJam")}
          </Link>
          <a
            href={`https://instagram.com/${BREAKINGJAM_INSTAGRAM}`}
            target="_blank"
            rel="noopener noreferrer"
            className={link}
          >
            <InstagramLogo size={16} weight="bold" aria-hidden />
            Instagram
          </a>
        </nav>
        <LanguageSwitch placement="up" />
      </div>
    </footer>
  );
}
