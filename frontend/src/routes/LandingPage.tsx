import { Plus } from "@phosphor-icons/react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../components/buttonClasses";
import { HeroSearch } from "../components/HeroSearch";
import { JamFlyer } from "../features/jams/JamFlyer";
import { ForDancers } from "../features/landing/ForDancers";
import { MapPreview } from "../features/landing/MapPreview";
import { NextUp } from "../features/landing/NextUp";
import { SceneSoFar } from "../features/landing/SceneSoFar";
import { useMapJams } from "../features/map/queries";
import { useMediaQuery } from "../lib/useMediaQuery";

const STEPS = [
  {
    number: "01",
    title: "landing.organisers.step1Title",
    body: "landing.organisers.step1Body",
  },
  {
    number: "02",
    title: "landing.organisers.step2Title",
    body: "landing.organisers.step2Body",
  },
  {
    number: "03",
    title: "landing.organisers.step3Title",
    body: "landing.organisers.step3Body",
  },
] as const;

/**
 * "/": the pitch with a jam search and the map, then the next jams near the visitor, the
 * dancers' and organisers' bands, and the scene in numbers (DESIGN.md §6 Landing).
 */
export function LandingPage() {
  return (
    <>
      <title>BreakingJam</title>
      <Hero />
      <NextUp />
      <ForDancers />
      <SceneSoFar />
      <ForOrganisers />
    </>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="rings -top-64 -right-64 size-[560px] lg:-top-48 lg:-right-72 lg:size-[900px]"
      />
      <div className="relative mx-auto grid max-w-content gap-8 px-4 py-10 md:px-6 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-14 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-6">
          <p className="text-label text-primary-text uppercase">
            {t("landing.overline")}
          </p>
          <h1 className="font-display text-display-xl lg:text-display-3xl">
            <Trans
              i18nKey="landing.title"
              components={{
                pill: (
                  <span className="rounded-full bg-primary px-[0.25em] text-on-primary" />
                ),
              }}
            />
          </h1>
          <p className="max-w-[440px] text-body-lg text-muted">
            {t("landing.pitch")}
          </p>
          <div className="flex flex-col gap-3">
            <HeroSearch
              label={t("map.search")}
              placeholder={t("map.searchPlaceholder")}
              submit={t("nav.findJam")}
              to="/map"
            />
            <Link
              to="/org/jams/new"
              className={`${buttonClasses("secondary", "lg")} w-full lg:w-auto lg:self-start`}
            >
              <Plus size={20} weight="bold" aria-hidden />
              {t("nav.registerJam")}
            </Link>
          </div>
        </div>
        <MapPreview />
      </div>
    </section>
  );
}

function ForOrganisers() {
  const { t } = useTranslation();
  const wide = useMediaQuery("(min-width: 1024px)");
  // Any jam's generated flyer will do; the furthest one is rarely among the cards above.
  const sample = useMapJams().data?.at(-1);
  const register = (
    <Link
      to="/org/jams/new"
      className={`${buttonClasses("primary", "lg")} w-full lg:w-auto`}
    >
      {t("nav.registerJam")}
    </Link>
  );

  return (
    <section
      aria-labelledby="organisers-title"
      className="border-t border-border py-10 lg:py-20"
    >
      <div className="mx-auto grid max-w-content gap-8 px-4 md:px-6 lg:grid-cols-[4fr_5fr_3fr] lg:items-start lg:gap-12 lg:px-8">
        <div className="flex flex-col gap-4">
          <p className="text-label text-primary-text uppercase">
            {t("landing.organisers.overline")}
          </p>
          <h2
            id="organisers-title"
            className="font-display text-display-md lg:text-display-xl"
          >
            {t("landing.organisers.title")}
          </h2>
          <p className="text-body text-muted">{t("landing.organisers.body")}</p>
          {/* Desktop only; a wrapper hides it, because the link itself is `inline-flex`. */}
          <div className="hidden lg:block">{register}</div>
        </div>
        <ol className="flex flex-col">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className="flex gap-4 border-b border-border py-4 first:pt-0"
            >
              <span
                aria-hidden
                className="font-display text-display-md text-primary-text"
              >
                {step.number}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-title">{t(step.title)}</h3>
                <p className="text-body-sm text-muted">{t(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>
        {sample && (
          // §4.24: at 112px wide the flyer is the compact one.
          <JamFlyer
            jam={sample}
            compact={!wide}
            lazy
            className="w-28 rounded-md lg:w-full lg:rounded-lg"
          />
        )}
        <div className="lg:hidden">{register}</div>
      </div>
    </section>
  );
}
