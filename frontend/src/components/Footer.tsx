import { InstagramLogo } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BREAKINGJAM_INSTAGRAM } from "../lib/instagram";
import { Wordmark } from "./Wordmark";

const LINK =
  "inline-flex min-h-11 items-center gap-2 text-body-sm font-bold underline-offset-2 hover:underline";

/** Content-page footer: the round logo, Contact, Team and Instagram; the header holds the rest (§6). */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border">
      {/* One row from about 400px; narrower, the links go under the logo. */}
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-10 md:px-6 lg:px-8">
        <Wordmark logo="round" />
        <div className="flex flex-wrap items-center gap-x-5">
          <Link to="/contact" className={LINK}>
            {t("nav.contact")}
          </Link>
          <Link to="/team" className={LINK}>
            {t("nav.team")}
          </Link>
          <a
            href={`https://instagram.com/${BREAKINGJAM_INSTAGRAM}`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            <InstagramLogo size={16} weight="bold" aria-hidden />
            Instagram
          </a>
        </div>
      </div>
    </footer>
  );
}
