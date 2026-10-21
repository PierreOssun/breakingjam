import { useTranslation } from "react-i18next";
import { HeroSearch } from "../components/HeroSearch";
import { NextUp } from "../features/landing/NextUp";
import { SceneSoFar } from "../features/landing/SceneSoFar";

/** "/": the search, then the next jams near the visitor and the scene in numbers (DESIGN.md §6 Landing). */
export function LandingPage() {
  return (
    <>
      <title>BreakingJam</title>
      <Hero />
      <NextUp />
      <SceneSoFar />
    </>
  );
}

/** The title and subtitle over the search, on one set of rings centred behind the block. */
function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="rings top-1/2 left-1/2 size-[560px] -translate-1/2 lg:size-[1120px]"
      />
      <div className="relative mx-auto flex max-w-content flex-col items-center px-4 pt-12 pb-16 md:px-6 lg:px-8 lg:pt-24 lg:pb-28">
        <h1 className="text-center font-display text-[32px] leading-[38px] font-extrabold text-balance lg:text-[56px] lg:leading-[62px]">
          {t("landing.heading")}
        </h1>
        <p className="mt-2 text-center text-[17px] leading-[26px] font-medium text-muted lg:mt-3 lg:text-[20px] lg:leading-[30px]">
          {t("landing.subtitle")}
        </p>
        <div className="mt-6 flex w-full justify-center lg:mt-9">
          <HeroSearch
            size="landing"
            label={t("landing.search")}
            placeholder={t("landing.searchPlaceholder")}
            submit={t("landing.searchSubmit")}
            to="/search"
          />
        </div>
      </div>
    </section>
  );
}
