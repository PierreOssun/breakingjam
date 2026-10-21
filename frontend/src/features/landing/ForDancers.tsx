import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { HeroSearch } from "../../components/HeroSearch";
import { DancerAvatar } from "../dancers/DancerAvatar";
import { IdentityCard } from "../dancers/IdentityCard";
import { JamRow } from "../dancers/JamList";
import { StatsStrip } from "../dancers/StatsStrip";
import { statsOf } from "../dancers/stats";

/** How many of the featured dancer's past jams show under their card. */
const LATEST = 2;

/** The first verified dancer, notable ones first; null when nobody is verified yet. */
function useFeaturedDancer() {
  return useQuery({
    queryKey: ["dancers", "featured"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/dancers", {
        params: { query: { verified: true, limit: 1 } },
      });
      if (!data) throw new Error(`featured dancer: ${response.status}`);
      return data.items[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

/** "For dancers": find yourself, next to a verified dancer's record as the example (§6). */
export function ForDancers() {
  const { t } = useTranslation();
  const featured = useFeaturedDancer().data;
  return (
    <section
      aria-labelledby="dancers-title"
      className="border-t border-border bg-surface"
    >
      <div className="mx-auto grid max-w-content gap-8 px-4 py-10 md:px-6 lg:grid-cols-[6fr_5fr] lg:items-center lg:gap-14 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-4">
          <p className="text-label text-primary-text uppercase">
            {t("landing.dancers.overline")}
          </p>
          <h2
            id="dancers-title"
            className="font-display text-display-md lg:text-display-xl"
          >
            {t("landing.dancers.title")}
          </h2>
          <p className="text-body-lg text-muted">{t("landing.dancers.body")}</p>
          <HeroSearch
            label={t("landing.dancers.search")}
            placeholder={t("landing.dancers.placeholder")}
            submit={t("landing.dancers.submit")}
            to="/dancers"
          />
          <p className="text-caption text-muted">
            {t("landing.dancers.notThere")}
          </p>
        </div>
        {featured && <FeaturedDancer dancer={featured} />}
      </div>
    </section>
  );
}

/** The example record: identity card, stats strip and latest past jams (§4.17, §4.15, §4.14). */
function FeaturedDancer({ dancer }: { dancer: Schemas["DancerSummary"] }) {
  const past = useQuery({
    queryKey: ["dancer", dancer.id, "events", "past"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/dancers/{id}/events", {
        params: { path: { id: dancer.id }, query: { scope: "past" } },
      });
      if (!data) throw new Error(`dancer events: ${response.status}`);
      return data.past;
    },
    staleTime: 5 * 60_000,
  }).data;
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-4 justify-self-center lg:justify-self-end">
      <IdentityCard
        heading="h3"
        name={dancer.dancer_name}
        verified={dancer.verified}
        flags={[dancer.country, dancer.country2]}
        aliases={dancer.aliases}
        instagram={dancer.instagram_handle}
        avatar={<DancerAvatar dancer={dancer} />}
      />
      {past && <StatsStrip stats={statsOf(past)} />}
      {past && past.length > 0 && (
        <ul>
          {past.slice(0, LATEST).map((p) => (
            <JamRow
              key={`${p.event.id}-${p.battle?.id ?? p.role}`}
              participation={p}
              past
            />
          ))}
        </ul>
      )}
    </div>
  );
}
