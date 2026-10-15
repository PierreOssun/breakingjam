import { ArrowRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../../components/buttonClasses";
import { countryName } from "../../lib/countries";
import { COUNTRY_BOUNDS } from "../map/countryBounds";
import { featuredJams } from "../map/jams";
import { useMapJams, useVisitorCountry } from "../map/queries";
import { RowCard } from "../map/RowCard";

/**
 * "Featured near you", first on the landing page: upcoming jams in the visitor's country,
 * then the nearest ones; nothing until both the jams and the country are known.
 */
export function FeaturedJams() {
  const { t, i18n } = useTranslation();
  const jams = useMapJams();
  const country = useVisitorCountry();
  if (!jams.data || country.isPending) return null;
  const visitor = country.data ?? null;
  const featured = featuredJams(jams.data, visitor, new Date());
  if (featured.length === 0) return null;

  const local = featured.filter((jam) => jam.country === visitor).length;
  const name = visitor ? countryName(visitor, i18n.language) : "";
  // Without a box for the country, featuredJams falls back to date order (§6).
  const nearest = visitor !== null && visitor in COUNTRY_BOUNDS;
  const scope =
    local > 0 && local === featured.length
      ? t("landing.featured.inCountry", { country: name })
      : local > 0
        ? t("landing.featured.inCountryAndNearby", { country: name })
        : nearest
          ? t("landing.featured.nearby")
          : t("landing.featured.soonest");

  return (
    <section
      aria-labelledby="featured-title"
      className="mx-auto flex max-w-content flex-col gap-4 px-4 pt-8 md:px-6 lg:px-8 lg:pt-12"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="featured-title" className="font-display text-display-md">
            {t("landing.featured.title")}
          </h2>
          <p className="text-body-sm text-muted">{scope}</p>
        </div>
        <Link to="/map" className={buttonClasses("ghost", "sm")}>
          {t("landing.featured.map")}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((jam) => (
          <li key={jam.id}>
            <RowCard jam={jam} />
          </li>
        ))}
      </ul>
    </section>
  );
}
