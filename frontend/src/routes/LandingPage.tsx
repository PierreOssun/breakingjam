import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../components/buttonClasses";
import { MapPreview } from "../components/MapPreview";
import { FeaturedJams } from "../features/landing/FeaturedJams";
import { SiteCounts } from "../features/landing/SiteCounts";

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
 * "/": jams featured near the visitor first, then the pitch with exactly two actions, Find a
 * jam and Register a jam, the site's counts and the organisers' steps (§1, §6).
 */
export function LandingPage() {
  const { t } = useTranslation();
  return (
    <>
      <title>BreakingJam</title>
      <FeaturedJams />
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="rings -top-28 -right-28 size-[360px] lg:size-[560px]"
        />
        <div className="relative mx-auto grid max-w-content gap-8 px-4 py-10 md:px-6 lg:grid-cols-12 lg:items-center lg:gap-12 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-6 lg:col-span-5">
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
            <p className="text-body-lg text-muted">{t("landing.pitch")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/map"
                className={`${buttonClasses("primary", "lg")} w-full sm:w-auto`}
              >
                <MagnifyingGlass size={20} weight="bold" aria-hidden />
                {t("nav.findJam")}
              </Link>
              <Link
                to="/org/jams/new"
                className={`${buttonClasses("secondary", "lg")} w-full sm:w-auto`}
              >
                <Plus size={20} weight="bold" aria-hidden />
                {t("nav.registerJam")}
              </Link>
            </div>
          </div>
          <MapPreview className="lg:col-span-7" />
        </div>
      </section>

      <SiteCounts />

      <section className="border-t border-border lg:bg-surface">
        <div className="mx-auto grid max-w-content gap-8 px-4 py-10 md:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-20">
          <div className="flex flex-col gap-4 lg:col-span-4">
            <h2 className="font-display text-display-md lg:text-display-xl">
              {t("landing.organisers.title")}
            </h2>
            <p className="text-body text-muted">
              {t("landing.organisers.body")}
            </p>
            {/* Desktop only; a wrapper hides it, because the link itself is `inline-flex`. */}
            <div className="hidden lg:block">
              <Link
                to="/org/jams/new"
                className={buttonClasses("primary", "lg")}
              >
                {t("nav.registerJam")}
              </Link>
            </div>
          </div>
          <ol className="grid gap-6 lg:col-span-8 lg:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.number} className="flex flex-col gap-2">
                <span
                  aria-hidden
                  className="font-display text-display-md text-primary-text"
                >
                  {step.number}
                </span>
                <h3 className="text-title">{t(step.title)}</h3>
                <p className="text-body-sm text-muted">{t(step.body)}</p>
              </li>
            ))}
          </ol>
          <Link
            to="/org/jams/new"
            className={`${buttonClasses("primary", "lg")} w-full lg:hidden`}
          >
            {t("nav.registerJam")}
          </Link>
        </div>
      </section>
    </>
  );
}
