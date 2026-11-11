import { CalendarBlank, NavigationArrow, Plus } from "@phosphor-icons/react";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { HeroSearch } from "../../components/HeroSearch";
import { currentPosition } from "../../lib/position";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { COUNTRY_BOUNDS } from "../map/countryBounds";
import { type Category, fitParam, jamsLink } from "../map/jams";
import { useVisitorCountry } from "../map/queries";

/** The battle chips, in the map's order. */
const BATTLES: Category[] = ["one_v_one", "two_v_two", "bgirl", "kids"];

/**
 * The landing's hero (DESIGN.md §6 Landing), centred: title, subtitle, search, quick filters,
 * then Register a jam.
 */
export function Hero() {
  const { t } = useTranslation();
  const country = useVisitorCountry();
  const wide = useMediaQuery("(min-width: 1024px)");
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="rings top-1/2 left-1/2 size-[560px] -translate-1/2 lg:size-[1120px]"
      />
      <div className="relative mx-auto flex max-w-content flex-col items-center px-4 pt-10 pb-12 md:px-6 lg:px-8 lg:pt-20 lg:pb-24">
        <h1 className="text-center font-display text-[32px] leading-[38px] font-extrabold text-balance lg:text-[60px] lg:leading-[64px]">
          {t("landing.heading")}
        </h1>
        <p className="mt-2 text-center text-[17px] leading-[26px] font-medium text-muted lg:mt-3 lg:text-[20px] lg:leading-[30px]">
          {t("landing.subtitle")}
        </p>
        <div className="mt-6 flex w-full justify-center lg:mt-9">
          <HeroSearch
            size="landing"
            label={t("landing.search")}
            placeholder={t(
              wide
                ? "landing.searchPlaceholder"
                : "landing.searchPlaceholderShort",
            )}
            submit={t("landing.searchSubmit")}
            to="/search"
          />
        </div>
        <QuickFilters country={country.data ?? null} />
        <RegisterJam />
      </div>
    </section>
  );
}

const CHIP =
  // A 36px chip in a 44px hit area (§8).
  "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[14px] font-bold whitespace-nowrap text-text transition-colors duration-fast after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-surface-raised focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid";

/** Shortcuts into the map and the jam list: a centred row that wraps from lg, scrolls edge to
 * edge below. */
function QuickFilters({ country }: { country: string | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const home = country ? COUNTRY_BOUNDS[country] : undefined;
  const fallback = home ? `/map?fit=${fitParam(home)}` : "/map";
  // Asks for the position only now; refused, the map opens on the visitor's country.
  const nearMe = (event: MouseEvent) => {
    event.preventDefault();
    currentPosition().then(
      ({ lng, lat }) => void navigate(`/map?lat=${lat}&lng=${lng}`),
      () => void navigate(fallback),
    );
  };
  const icon = (glyph: ReactNode) => (
    <span aria-hidden className="text-primary-text">
      {glyph}
    </span>
  );
  return (
    <nav
      aria-label={t("landing.quickFilters")}
      className="-mx-4 mt-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:-mx-6 md:w-[calc(100%+3rem)] md:px-6 lg:mx-0 lg:mt-5 lg:w-auto lg:flex-wrap lg:justify-center lg:overflow-visible lg:px-0"
    >
      <Link to={fallback} onClick={nearMe} className={CHIP}>
        {icon(<NavigationArrow size={15} weight="bold" />)}
        {t("landing.nearMe")}
      </Link>
      <Link to={jamsLink({ when: "weekend" })} className={CHIP}>
        {icon(<CalendarBlank size={15} weight="bold" />)}
        {t("map.weekend")}
      </Link>
      {BATTLES.map((category) => (
        <Link
          key={category}
          to={jamsLink({ categories: [category] })}
          className={CHIP}
        >
          {t(`map.categories.${category}`)}
        </Link>
      ))}
    </nav>
  );
}

/** The big gradient Register a jam, centred; full width below lg. */
function RegisterJam() {
  const { t } = useTranslation();
  return (
    <Link
      to="/org/jams/new"
      className="mt-6 inline-flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(120deg,var(--color-primary),var(--color-accent))] pr-[26px] pl-2 text-[17px] font-extrabold whitespace-nowrap text-on-primary shadow-[0_10px_24px_color-mix(in_srgb,var(--color-accent)_35%,transparent)] transition-[filter] duration-fast hover:brightness-110 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid lg:mt-8 lg:w-auto lg:justify-start"
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full bg-on-primary/20"
      >
        <Plus size={18} weight="bold" />
      </span>
      {t("nav.registerJam")}
    </Link>
  );
}
