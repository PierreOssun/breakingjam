import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { InlineEmpty } from "../components/InlineEmpty";
import { JamRow } from "../components/JamRow";
import { TextField } from "../components/TextField";
import { FilterChips } from "../features/map/FilterChips";
import { type Filters, narrow, NO_FILTERS } from "../features/map/jams";
import { useMapJams } from "../features/map/queries";
import { useSearchText } from "../lib/useSearchText";

const PAGE = 30;

/** `/jams`, "Find a jam": every jam as a list, searched and filtered like the map (DESIGN.md §6). */
export function JamsPage() {
  const { t, i18n } = useTranslation();
  // Matches as you type; the URL gets the search once typing pauses.
  const [text, setText] = useSearchText();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const jams = useMapJams();
  const matching = useMemo(
    () =>
      narrow(jams.data ?? [], filters, text.trim(), i18n.language, new Date()),
    [jams.data, filters, text, i18n.language],
  );

  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
      <title>{`${t("pages.jams")} · BreakingJam`}</title>
      <h1 className="font-display text-display-lg lg:text-display-xl">
        {t("pages.jams")}
      </h1>
      <TextField
        type="search"
        label={t("map.search")}
        placeholder={t("map.searchPlaceholder")}
        autoComplete="off"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setShown(PAGE);
        }}
      />
      <FilterChips
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          setShown(PAGE);
        }}
        variant="panel"
      />
      {jams.isError && (
        <p role="alert" className="text-body-sm text-danger">
          {t("map.loadError")}
        </p>
      )}
      {jams.isSuccess && (
        <p role="status" className="text-body-sm text-muted">
          {t("jams.count", { count: matching.length })}
        </p>
      )}
      {jams.isSuccess && matching.length === 0 && (
        <InlineEmpty>{t("jams.empty")}</InlineEmpty>
      )}
      <ul aria-label={t("pages.jams")}>
        {matching.slice(0, shown).map((jam) => (
          <li key={jam.id}>
            <JamRow jam={jam} to={`/jams/${jam.slug}`} />
          </li>
        ))}
      </ul>
      {matching.length > shown && (
        <Button variant="secondary" onClick={() => setShown(shown + PAGE)}>
          {t("jams.showMore")}
        </Button>
      )}
    </section>
  );
}
