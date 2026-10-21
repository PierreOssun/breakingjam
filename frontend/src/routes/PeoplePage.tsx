import { useTranslation } from "react-i18next";
import { InlineEmpty } from "../components/InlineEmpty";
import { MoreList } from "../components/MoreList";
import { TextField } from "../components/TextField";
import { PersonRow } from "../features/dancers/PersonRow";
import { useDancerSearch } from "../features/dancers/search";
import { useSearchText } from "../lib/useSearchText";

/** `/dancers`, "Find someone": bboys, bgirls, DJs and MCs by name, alias or handle, notable first. */
export function PeoplePage() {
  const { t } = useTranslation();
  const [text, setText, q] = useSearchText();
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
