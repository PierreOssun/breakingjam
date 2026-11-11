import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Flag } from "../../components/Flag";
import { Loading, Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/useToast";
import { VideosChip } from "../../components/VideosChip";
import { countryName } from "../../lib/countries";
import { formatDateRange, formatShortDateRange } from "../../lib/dates";
import {
  currentPosition,
  type LngLat,
  positionAllowed,
} from "../../lib/position";
import { CountdownChip } from "../jams/CountdownChip";
import { tellsVisitors } from "../jams/jamDetail";
import { JamFlyer } from "../jams/JamFlyer";
import { jamPath, type MapJam } from "../map/jams";
import { useMapJams, useVisitorCountry } from "../map/queries";
import { cardShell, stretched } from "../map/RowCard";
import { cardCountdown, NEXT_UP, nextUp, referencePoint } from "./landing";
import { LandingSection, SECTION_ROW } from "./LandingSection";

const cell = "w-[232px] shrink-0 snap-start lg:w-auto";

/**
 * "Next up near you": the soonest jams around the visitor's position or IP country, soonest
 * first; hidden when none is upcoming.
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
  const section = {
    id: "next-title",
    title: t("landing.next.title"),
    link: {
      to: "/map",
      label: t("landing.next.map"),
      short: t("landing.next.mapShort"),
    },
  };

  // A failed refetch keeps the jams already shown; only a first load that fails hides it.
  if (!jams.data && jams.isError) return null;
  if (!jams.data || country.isPending)
    return (
      <LandingSection
        {...section}
        sub={<Skeleton className="inline-block h-4 w-40 rounded-md" />}
      >
        <Loading className={`${SECTION_ROW} lg:grid-cols-4`}>
          {Array.from({ length: NEXT_UP }, (_, i) => (
            <div key={i} className={cell}>
              <CardSkeleton />
            </div>
          ))}
        </Loading>
      </LandingSection>
    );
  const visitor = country.data ?? null;
  const next = nextUp(jams.data, referencePoint(position, visitor));
  if (next.length === 0) return null;
  const locate = () =>
    currentPosition().then(setPosition, () =>
      toast({ kind: "error", message: t("map.locateError") }),
    );
  // Without any location, the line goes: the cards are simply the soonest anywhere.
  const around = position
    ? t("landing.next.aroundYou")
    : visitor &&
      t("landing.next.around", { place: countryName(visitor, i18n.language) });

  return (
    <LandingSection
      {...section}
      sub={
        around && (
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
        )
      }
    >
      <ul className={`${SECTION_ROW} lg:grid-cols-4`}>
        {next.map((jam) => (
          <li key={jam.id} className={cell}>
            <NextUpCard jam={jam} />
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}

/**
 * A jam as Next up shows it (DESIGN.md §4.3): the flyer, then a slim countdown row. A generated
 * flyer already prints the date, name and city; an uploaded one may not, so they follow it.
 */
function NextUpCard({ jam }: { jam: MapJam }) {
  const { i18n } = useTranslation();
  const uploaded = jam.flyer_card_url != null;
  const dates = formatDateRange(jam.starts_on, jam.ends_on, i18n.language);
  const link = (
    <Link to={jamPath(jam)} className={stretched}>
      {uploaded ? jam.name : <span className="sr-only">{jam.name}</span>}
      <span className="sr-only">
        , {dates}, {jam.city}
      </span>
    </Link>
  );
  return (
    <article
      className={`${cardShell} flex h-full flex-col overflow-hidden rounded-[20px] border-border bg-surface`}
    >
      <JamFlyer jam={jam} lazy />
      {uploaded ? (
        <div className="flex flex-col items-start gap-1 px-3 pt-3">
          <p className="text-label text-primary-text uppercase">
            {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
          </p>
          <h3 className="line-clamp-2 font-display text-display-xs break-words">
            {link}
          </h3>
          <p className="flex items-center gap-1.5 text-body-sm text-muted">
            <Flag code={jam.country} size="bare" />
            {jam.city}
          </p>
        </div>
      ) : (
        <h3>{link}</h3>
      )}
      {/* The status sits under the flyer: over it, it covers the flyer's own print. Right under
          a generated flyer, so a row that wraps on one card leaves no gap above its neighbours';
          an uploaded one's text varies in height, so its row keeps to the card's foot. */}
      <div
        className={`flex flex-wrap items-center gap-2 px-3 py-2.5 ${uploaded ? "mt-auto" : ""}`}
      >
        <CountdownChip value={cardCountdown(jam, new Date())} />
        {/* Only a status that matters to a visitor: never Published (§4.3). */}
        {jam.phase === "upcoming" && tellsVisitors(jam) && (
          <StatusBadge jam={jam} />
        )}
        {/* Here, not over the flyer: on a card this narrow it hid the flyer's city or battles. */}
        {jam.has_videos && <VideosChip on="row" />}
      </div>
    </article>
  );
}

/** A card's shape while jams load (DESIGN.md §4.29). */
function CardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-surface">
      <Skeleton className="aspect-[4/5] rounded-none" />
      <div className="px-3 py-2.5">
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  );
}
