import { ArrowRight } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { buttonClasses } from "../components/buttonClasses";
import { HeroSearch } from "../components/HeroSearch";
import { InlineEmpty } from "../components/InlineEmpty";
import { JamRow } from "../components/JamRow";
import { MoreList } from "../components/MoreList";
import { PersonRow } from "../features/dancers/PersonRow";
import { useDancerSearch } from "../features/dancers/search";
import { narrow, NO_FILTERS } from "../features/map/jams";
import { useMapJams } from "../features/map/queries";

/** Jams shown before "See all on the map". */
const JAMS = 10;

/** `/search?q=`: what the landing search finds, jams then people (DESIGN.md §6). */
export function SearchPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const jams = useMapJams();
  const people = useDancerSearch(q);
  const matching = useMemo(
    () => narrow(jams.data ?? [], NO_FILTERS, q, i18n.language, new Date()),
    [jams.data, q, i18n.language],
  );
  const onMap = q ? `/map?q=${encodeURIComponent(q)}` : "/map";

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
      <section aria-labelledby="search-jams" className="flex flex-col gap-4">
        <h2 id="search-jams" className="font-display text-display-md">
          {t("search.jams")}
        </h2>
        {jams.isError && (
          <p role="alert" className="text-body-sm text-danger">
            {t("map.loadError")}
          </p>
        )}
        {jams.isSuccess && matching.length === 0 && (
          <InlineEmpty>
            {q ? t("search.noJams", { q }) : t("search.noUpcoming")}
          </InlineEmpty>
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
      <section aria-labelledby="search-people" className="flex flex-col gap-4">
        <h2 id="search-people" className="font-display text-display-md">
          {t("search.people")}
        </h2>
        <MoreList
          query={people}
          empty={
            <InlineEmpty>
              {q ? t("people.empty", { q }) : t("people.nobody")}
            </InlineEmpty>
          }
          more={t("people.showMore")}
          label={t("search.people")}
        >
          {(person) => <PersonRow person={person} />}
        </MoreList>
      </section>
    </div>
  );
}
