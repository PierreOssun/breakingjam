import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** "Breaking" + "Jam" in the blue pill, linking home (DESIGN.md §4.6). */
export function Wordmark() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      aria-label={t("nav.home")}
      className="inline-flex min-h-11 items-center font-display text-[16px] font-extrabold lg:text-[18px]"
    >
      Breaking
      <span className="ml-[0.1em] rounded-full bg-primary px-[0.35em] text-on-primary">
        Jam
      </span>
    </Link>
  );
}
