import { ArrowRight } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../../components/buttonClasses";
import { Loading, Skeleton } from "../../components/Skeleton";
import { useToast } from "../../components/useToast";
import { countryName } from "../../lib/countries";
import {
  currentPosition,
  type LngLat,
  positionAllowed,
} from "../../lib/position";
import { GridCard, GridCardSkeleton } from "../map/GridCard";
import { featuredJams, nearestJams } from "../map/jams";
import { useMapJams, useVisitorCountry } from "../map/queries";

/** How many cards the desktop grid shows; phones scroll through all of them. */
const DESKTOP_CARDS = 4;

// Phones: a row of 240px cards that snaps; from lg, a grid of the first four.
const ROW =
  "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0";
const cell = (i: number) =>
  `w-60 shrink-0 snap-start lg:w-auto ${i >= DESKTOP_CARDS ? "lg:hidden" : ""}`;

/**
 * "Next up near you": upcoming jams around the visitor, by their position when they already
 * allowed it (or ask with "change"), else by their IP's country; hidden when none are upcoming.
 */
export function NextUp() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const jams = useMapJams();
  const country = useVisitorCountry();
  const [position, setPosition] = useState<LngLat | null>(null);
  useEffect(() => {
    // Never prompts on load: only a position the visitor already shares is read.
    void positionAllowed().then((allowed) => {
      if (allowed) currentPosition().then(setPosition, () => undefined);
    });
  }, []);

  // A failed refetch keeps the jams already shown; only a first load that fails hides it.
  if (!jams.data && jams.isError) return null;
  if (!jams.data || country.isPending)
    return (
      <Shell
        around={
          <Skeleton className="rounded-md inline-block h-4 w-40 align-middle" />
        }
      >
        <Loading className={ROW}>
          {Array.from({ length: DESKTOP_CARDS }, (_, i) => (
            <div key={i} className={cell(i)}>
              <GridCardSkeleton />
            </div>
          ))}
        </Loading>
      </Shell>
    );
  const visitor = country.data ?? null;
  const today = new Date();
  const next = position
    ? nearestJams(jams.data, position, today)
    : featuredJams(jams.data, visitor, today);
  if (next.length === 0) return null;
  const around = position
    ? t("landing.next.aroundYou")
    : visitor
      ? t("landing.next.around", {
          place: countryName(visitor, i18n.language),
        })
      : t("landing.next.worldwide");
  const locate = () =>
    currentPosition().then(setPosition, () =>
      toast({ kind: "error", message: t("map.locateError") }),
    );

  return (
    <Shell
      around={
        <>
          {around} ·{" "}
          <button
            type="button"
            onClick={() => void locate()}
            // A 44px hit area around the word (§4).
            className="relative cursor-pointer font-bold text-primary-text underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
          >
            {t("landing.next.change")}
          </button>
        </>
      }
    >
      <ul className={ROW}>
        {next.map((jam, i) => (
          <li key={jam.id} className={cell(i)}>
            <GridCard jam={jam} />
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/** The section around the cards, also while they load: title, where they are, the map link. */
function Shell({
  around,
  children,
}: {
  around: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="next-title"
      className="border-t border-border py-10 lg:py-20"
    >
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 md:px-6 lg:gap-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2
              id="next-title"
              className="font-display text-display-md lg:text-display-xl"
            >
              {t("landing.next.title")}
            </h2>
            <p className="text-body-sm text-muted">{around}</p>
          </div>
          <Link to="/map" className={buttonClasses("ghost", "sm")}>
            {t("landing.next.map")}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}
