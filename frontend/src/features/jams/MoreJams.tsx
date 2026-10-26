import { ArrowRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { buttonClasses } from "../../components/buttonClasses";
import { GridCard } from "../map/GridCard";
import { otherJams } from "../map/jams";
import { useMapJams } from "../map/queries";

/** The jam page's last section: up to 4 other upcoming jams, nearest first; none, no section. */
export function MoreJams({ jam }: { jam: Schemas["EventResponse"] }) {
  const { t } = useTranslation();
  const jams = useMapJams();
  const next = otherJams(jams.data ?? [], jam, new Date());
  if (next.length === 0) return null;
  return (
    <section
      aria-labelledby="more-jams"
      className="mx-auto mt-16 flex max-w-content flex-col gap-4 px-4 md:px-6 lg:mt-20 lg:gap-6 lg:px-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="more-jams" className="font-display text-display-md">
          {t("jam.moreJams")}
        </h2>
        <Link to="/map" className={buttonClasses("ghost", "sm")}>
          {t("jam.seeMap")}
          <ArrowRight size={16} weight="bold" aria-hidden />
        </Link>
      </div>
      {/* Phones: a row of 200px cards that snaps; from lg, four columns. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
        {next.map((other) => (
          <li
            key={other.id}
            className="w-[200px] shrink-0 snap-start lg:w-auto"
          >
            <GridCard jam={other} />
          </li>
        ))}
      </ul>
    </section>
  );
}
