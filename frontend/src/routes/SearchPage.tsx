import { ArrowRight } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { buttonClasses } from "../components/buttonClasses";
import { HeroSearch } from "../components/HeroSearch";
import { InlineEmpty } from "../components/InlineEmpty";
import { JamRow } from "../components/JamRow";
import { MoreList } from "../components/MoreList";
import { RowsSkeleton } from "../components/Skeleton";
import { PersonRow } from "../features/dancers/PersonRow";
import { useDancerSearch } from "../features/dancers/search";
import { narrow, NO_FILTERS } from "../features/map/jams";
import { useMapJams } from "../features/map/queries";
import { NearCard } from "../features/places/NearCard";
import { usePlace } from "../features/places/queries";

/** Jams shown before "See all on the map". */
const JAMS = 10;

/**
 * `/search?q=`: what the landing search finds (DESIGN.md §6): "Near <Place>" when the words
 * name a city, then the jams and the people they match. A section with nothing in it hides
 * while another has results; with nothing anywhere, one empty state says so.
 */
export function SearchPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const jams = useMapJams();
  const people = useDancerSearch(q);
  const place = usePlace(q);
  const matching = useMemo(
    () => narrow(jams.data ?? [], NO_FILTERS, q, i18n.language, new Date()),
    [jams.data, q, i18n.language],
  );
  const onMap = q ? `/map?q=${encodeURIComponent(q)}` : "/map";
  const someone = (people.data?.pages[0]?.items.length ?? 0) > 0;
  // A failed place lookup is no place: the jams and people still show.
  const found = place.data ?? null;
  const settled =
    jams.isSuccess && people.isSuccess && (q === "" || !place.isPending);
  const nothing =
    q !== "" && settled && !found && matching.length === 0 && !someone;

  return (
    <div className="mx-auto flex max-w-prose flex-col gap-10 px-4 py-10 md:px-6 lg:gap-16 lg:py-20">
      <title>{`${q || t("pages.search")} · BreakingJam`}</title>
      <h1 className="sr-only">{t("pages.search")}</h1>
      <HeroSearch
        label={t("landing.search")}
        placeholder={t("landing.searchPlaceholder")}
        submit={t("landing.searchSubmit")}
        to="/search"
        initial={q}
      />
      {nothing && <InlineEmpty>{t("search.nothing", { q })}</InlineEmpty>}
      {found && jams.data && <NearCard place={found} jams={jams.data} />}
      {/* Shown while loading, on error, or with matches; never empty. */}
      {(!jams.isSuccess || matching.length > 0) && (
        <section aria-labelledby="search-jams" className="flex flex-col gap-4">
          <h2 id="search-jams" className="font-display text-display-md">
            {t("search.jams")}
          </h2>
          {jams.isPending && <RowsSkeleton rows={3} />}
          {jams.isError && (
            <p role="alert" className="text-body-sm text-danger">
              {t("map.loadError")}
            </p>
          )}
          <ul aria-label={t("search.jams")}>
            {matching.slice(0, JAMS).map((jam) => (
              <li key={jam.id}>
                <JamRow jam={jam} to={`/jams/${jam.slug}`} />
              </li>
            ))}
          </ul>
          {matching.length > JAMS && (
            <Link
              to={onMap}
              className={`${buttonClasses("ghost", "sm")} self-start`}
            >
              {t("search.allOnMap")}
              <ArrowRight size={16} weight="bold" aria-hidden />
            </Link>
          )}
        </section>
      )}
      {(!people.isSuccess || someone) && (
        <section
          aria-labelledby="search-people"
          className="flex flex-col gap-4"
        >
          <h2 id="search-people" className="font-display text-display-md">
            {t("search.people")}
          </h2>
          <MoreList
            query={people}
            empty={null}
            more={t("people.showMore")}
            label={t("search.people")}
          >
            {(person) => <PersonRow person={person} />}
          </MoreList>
        </section>
      )}
    </div>
  );
}
