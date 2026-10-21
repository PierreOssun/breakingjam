import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { InlineEmpty } from "../components/InlineEmpty";
import { MoreList } from "../components/MoreList";
import { TextField } from "../components/TextField";
import { PersonRow } from "../features/dancers/PersonRow";
import { useDancerSearch } from "../features/dancers/search";
import { useDebounced } from "../lib/useDebounced";

/** `/dancers`, "Find someone": bboys, bgirls, DJs and MCs by name, alias or handle, notable first. */
export function PeoplePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  // Search once typing pauses; the URL keeps the search, so back and shared links return to it.
  const settled = useDebounced(text.trim(), 250);
  const pushed = useRef(q);
  useEffect(() => {
    // A `q` changed by back or forward is the next effect's; a debounce still behind the
    // field waits. Retyping the search Back just cleared then pushes it again.
    if (q !== pushed.current || settled !== text.trim() || settled === q)
      return;
    pushed.current = settled;
    setParams(settled ? { q: settled } : {}, { replace: true });
  }, [settled, text, q, setParams]);
  // A `q` this page did not push (back, forward, the header's link) replaces what was typed.
  useEffect(() => {
    if (q !== pushed.current) {
      pushed.current = q;
      setText(q);
    }
  }, [q]);
  const people = useDancerSearch(q);

  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
      <title>{`${t("pages.people")} · BreakingJam`}</title>
      <h1 className="font-display text-display-lg lg:text-display-xl">
        {t("pages.people")}
      </h1>
      <TextField
        type="search"
        label={t("people.search")}
        hint={t("people.hint")}
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <MoreList
        query={people}
        empty={
          <InlineEmpty>
            {q ? t("people.empty", { q }) : t("people.nobody")}
          </InlineEmpty>
        }
        more={t("people.showMore")}
        label={t("pages.people")}
      >
        {(person) => <PersonRow person={person} />}
      </MoreList>
    </section>
  );
}
