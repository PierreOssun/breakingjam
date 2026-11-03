import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Button } from "../components/Button";
import { InlineEmpty } from "../components/InlineEmpty";
import { MoreList } from "../components/MoreList";
import { TextField } from "../components/TextField";
import { safeNext } from "../features/auth/safeNext";
import { ME_KEY, useMe } from "../features/auth/useMe";
import { NewDancer } from "../features/dancers/DancerPicker";
import { PersonRow } from "../features/dancers/PersonRow";
import { useDancerSearch } from "../features/dancers/search";
import { useDebounced } from "../lib/useDebounced";

/**
 * `/welcome` (M25), right after sign-up: "Are you on BreakingJam?" Find your page and verify it,
 * make it once a search has come up empty-handed, or go on to `next`.
 */
export function WelcomePage() {
  const { t } = useTranslation();
  const me = useMe().data;
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState(me?.display_name ?? "");
  const q = useDebounced(text.trim(), 250);
  const people = useDancerSearch(q);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // The new page, even once `me` knows of it: the redirect below would win the race to `next`
  // while the page's route still loads.
  if (created) return <Navigate to={`/dancers/${created}`} replace />;
  // An account that has its page has nothing to find here.
  if (!me || me.dancer) return <Navigate to={next} replace />;
  // Search before create: a page is made only once a search has had its say.
  const searched = q !== "" && people.isSuccess;
  return (
    <section className="mx-auto flex max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-20">
      <title>{`${t("welcome.title")} · BreakingJam`}</title>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-display-lg lg:text-display-xl">
          {t("welcome.title")}
        </h1>
        <p className="text-body-lg text-muted">{t("welcome.intro")}</p>
      </div>
      <TextField
        type="search"
        label={t("welcome.search")}
        hint={t("welcome.searchHint")}
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {q && (
        <MoreList
          query={people}
          empty={<InlineEmpty>{t("welcome.nobody", { q })}</InlineEmpty>}
          more={t("people.showMore")}
          label={t("welcome.found")}
        >
          {(person) => <PersonRow person={person} />}
        </MoreList>
      )}
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong p-4">
        <div className="flex flex-col gap-1">
          <p className="text-body font-extrabold">{t("welcome.notHere")}</p>
          <p className="text-body-sm text-muted">{t("welcome.notHereBody")}</p>
        </div>
        {creating ? (
          <NewDancer
            name={q}
            route="/api/dancers/mine"
            label={t("welcome.create")}
            onCreated={(dancer) => {
              setCreated(dancer.id);
              // The account menu shows the new page as the account's own.
              void queryClient.invalidateQueries({ queryKey: ME_KEY });
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button
            variant="secondary"
            className="self-start"
            disabled={!searched}
            onClick={() => setCreating(true)}
          >
            {t("welcome.create")}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        className="self-center"
        onClick={() => navigate(next, { replace: true })}
      >
        {t("welcome.skip")}
      </Button>
    </section>
  );
}
