import { useTranslation } from "react-i18next";
import { Link } from "react-router";

// §10: below 48px only the "J" may show; the full round "Jam" from 48px up.
const LOGOS = {
  mark: { src: "/favicon.svg", className: "size-8 lg:size-9" },
  round: { src: "/jam-logo.svg", className: "size-14" },
};

/** The logo, then "Breaking" + "Jam" in the blue pill, linking home (DESIGN.md §4.6, §10). */
export function Wordmark({ logo }: { logo: keyof typeof LOGOS }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      aria-label={t("nav.home")}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-[16px] font-extrabold lg:gap-2.5 lg:text-[18px]"
    >
      <img src={LOGOS[logo].src} alt="" className={LOGOS[logo].className} />
      <span>
        Breaking
        <span className="ml-[0.1em] rounded-full bg-primary px-[0.35em] text-on-primary">
          Jam
        </span>
      </span>
    </Link>
  );
}
