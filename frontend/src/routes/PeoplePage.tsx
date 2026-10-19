import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Button } from "../components/Button";
import { InlineEmpty } from "../components/InlineEmpty";
import { TextField } from "../components/TextField";
import { PersonRow } from "../features/dancers/PersonRow";
import { useDancerSearch } from "../features/dancers/search";

/** `/dancers`, "Find someone": bboys, bgirls, DJs and MCs by name, alias or handle, notable first. */
export function PeoplePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  // Search once typing pauses; the URL keeps the search, so back and shared links return to it.
  const pushed = useRef(q);
  useEffect(() => {
    const next = text.trim();
    if (next === q) return;
    const timer = setTimeout(() => {
      pushed.current = next;
      setParams(next ? { q: next } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [text, q, setParams]);
  // A `q` this page did not push (back, forward, the header's link) replaces what was typed.
  useEffect(() => {
    if (q !== pushed.current) {
      pushed.current = q;
      setText(q);
    }
  }, [q]);
  const people = useDancerSearch(q);
  const items = people.data?.pages.flatMap((page) => page.items) ?? [];

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
      {people.isError && <p className="text-danger">{t("errors.generic")}</p>}
      {people.isSuccess && items.length === 0 && (
        <InlineEmpty>
          {q ? t("people.empty", { q }) : t("people.nobody")}
        </InlineEmpty>
      )}
      <ul aria-label={t("pages.people")}>
        {items.map((person) => (
          <li key={person.id}>
            <PersonRow person={person} />
          </li>
        ))}
      </ul>
      {people.hasNextPage && (
        <Button
          variant="secondary"
          loading={people.isFetchingNextPage}
          onClick={() => void people.fetchNextPage()}
        >
          {t("people.showMore")}
        </Button>
      )}
    </section>
  );
}
