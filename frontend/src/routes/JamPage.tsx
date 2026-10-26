import {
  ArrowLeft,
  CalendarBlank,
  EnvelopeSimple,
  Globe,
  InstagramLogo,
  MapPin,
  NavigationArrow,
  PencilSimple,
  Trophy,
} from "@phosphor-icons/react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import type { Schemas } from "../api/client";
import { buttonClasses } from "../components/buttonClasses";
import { ExternalLink } from "../components/ExternalLink";
import { Flag } from "../components/Flag";
import { InlineEmpty } from "../components/InlineEmpty";
import { ShareButton } from "../components/ShareButton";
import { Loading, Skeleton } from "../components/Skeleton";
import { StatusBadge } from "../components/StatusBadge";
import { VerifiedTick } from "../components/VerifiedTick";
import { VideoDialog, type Video } from "../components/VideoDialog";
import { BattleCard } from "../features/jams/BattleCard";
import { CountdownChip } from "../features/jams/CountdownChip";
import { FlyerActions } from "../features/jams/FlyerEditor";
import { ActionBar, ActionCard } from "../features/jams/JamActions";
import {
  countdown,
  directionsUrl,
  firstStart,
  initialsOf,
  shareTitle,
  totalPrizes,
  whoIsIn,
} from "../features/jams/jamDetail";
import { JamFlyer } from "../features/jams/JamFlyer";
import { Lineup } from "../features/jams/Lineup";
import { MoreJams } from "../features/jams/MoreJams";
import {
  useBattles,
  useEntries,
  useJam,
  useStaff,
} from "../features/jams/queries";
import { WhosIn } from "../features/jams/WhosIn";
import { countryName } from "../lib/countries";
import {
  formatBattleStart,
  formatDateRange,
  formatShortDateRange,
} from "../lib/dates";
import { instagramLabel } from "../lib/instagram";
import { NotFoundPage } from "./NotFoundPage";

// MapLibre is heavy: only jam pages with a pin load it.
const VenueMap = lazy(() => import("../features/jams/VenueMap"));

type Jam = Schemas["EventResponse"];

/**
 * `/jams/:slug`: the most shared page (DESIGN.md §6 Jam detail). The flyer, title and what
 * counts for coming, then the battles, lineup, venue and organiser. Its organiser manages the
 * people here: entries in each battle, and the lineup.
 */
export function JamPage() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const jam = useJam(slug);
  if (jam.isPending) return <JamSkeleton />;
  if (jam.isError)
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-danger">
        {t("errors.generic")}
      </p>
    );
  if (!jam.data) return <NotFoundPage />;
  return <JamDetail jam={jam.data} />;
}

/** The jam page's shape while the jam loads (DESIGN.md §4.29): back bar, flyer, title, facts. */
function JamSkeleton() {
  return (
    <Loading className="pb-10 lg:pb-20">
      <div className="mx-auto flex max-w-content items-center justify-between px-4 py-2 md:px-6 lg:px-8">
        <Skeleton className="h-11 w-24 rounded-full" />
        <Skeleton className="size-11 rounded-full" />
      </div>
      <div className="mx-auto max-w-content lg:grid lg:grid-cols-[420px_1fr] lg:gap-14 lg:px-8">
        <div className="px-4 md:px-6 lg:px-0">
          <Skeleton className="aspect-[4/5] rounded-lg" />
        </div>
        <div className="flex max-w-prose flex-col gap-4 px-4 pt-6 md:px-6 lg:px-0 lg:pt-0">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-10 w-3/4 rounded-md lg:h-14" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-1/2 rounded-md" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

function JamDetail({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const [video, setVideo] = useState<Video | null>(null);
  const battles = useBattles(jam.id);
  const staff = useStaff(jam.id);
  const entries = useEntries((battles.data ?? []).map((b) => b.id));
  const who = whoIsIn(
    entries.flatMap((e) => e.data ?? []),
    staff.data ?? [],
  );
  const chip = countdown(jam, firstStart(battles.data ?? []), new Date());

  return (
    <article className="lg:pb-20">
      <title>{`${jam.name} · BreakingJam`}</title>
      <TopBar jam={jam} />

      <div className="mx-auto max-w-content lg:grid lg:grid-cols-[420px_1fr] lg:gap-14 lg:px-8">
        <aside className="flex flex-col gap-3 px-4 md:px-6 lg:sticky lg:top-6 lg:self-start lg:px-0">
          <JamFlyer jam={jam} className="rounded-lg" />
          {jam.can_edit && <FlyerActions jam={jam} />}
          <ActionCard jam={jam} />
        </aside>

        <div className="flex max-w-prose flex-col gap-10 px-4 pt-4 md:px-6 lg:px-0 lg:pt-0">
          <header className="flex flex-col gap-3 lg:gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={jam.status} />
              {chip && <CountdownChip value={chip} />}
            </div>
            <h1 className="font-display text-display-lg break-words lg:text-display-2xl">
              {jam.name}
            </h1>
            <Meta jam={jam} battles={battles.data ?? []} />
            <WhosIn who={who} />
          </header>

          {/* Desktop only: phones read the meta lines above and find links under Info. */}
          <dl className="hidden gap-5 lg:grid lg:grid-cols-2">
            <WhenWhere jam={jam} battles={battles.data ?? []} />
            <Links jam={jam} />
          </dl>

          <Section id="battles" title={t("jam.battles")}>
            {battles.isPending ? (
              <Loading className="flex flex-col gap-4">
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
              </Loading>
            ) : battles.isError ? (
              <p className="text-danger">{t("errors.generic")}</p>
            ) : battles.data.length === 0 ? (
              <InlineEmpty>{t("jam.noBattles")}</InlineEmpty>
            ) : (
              <ul className="flex flex-col gap-4">
                {battles.data.map((battle, index) => (
                  <BattleCard
                    key={battle.id}
                    jam={jam}
                    battle={battle}
                    entries={entries[index]?.data}
                    onPlay={setVideo}
                  />
                ))}
              </ul>
            )}
          </Section>

          {staff.data && (jam.can_edit || staff.data.length > 0) && (
            <Section id="lineup" title={t("jam.lineup")}>
              <Lineup
                jamId={jam.id}
                staff={staff.data}
                canEdit={jam.can_edit}
              />
            </Section>
          )}

          {jam.description && (
            <Section title={t("jam.about")}>
              <p className="text-body whitespace-pre-line">{jam.description}</p>
            </Section>
          )}

          {(jam.website_url || jam.contact_email || jam.instagram_url) && (
            <div className="lg:hidden">
              <Section title={t("jam.info")}>
                <dl className="grid gap-5">
                  <Links jam={jam} />
                </dl>
              </Section>
            </div>
          )}

          <Venue jam={jam} />

          {/* The BreakingJam team lists jams it doesn't run: no organiser then. */}
          {jam.organizer && (
            <Section title={t("jam.organiser")}>
              <OrganizerCard
                organizer={jam.organizer}
                email={jam.contact_email}
              />
            </Section>
          )}
        </div>
      </div>

      <MoreJams jam={jam} />
      <ActionBar jam={jam} />
      <VideoDialog video={video} onClose={() => setVideo(null)} />
    </article>
  );
}

/** ← Map, Edit jam for its writers, and Share: an icon on phones, with its label from lg. */
function TopBar({ jam }: { jam: Jam }) {
  const { t, i18n } = useTranslation();
  const title = shareTitle(jam, i18n.language);
  return (
    // No padding on phones: the first screen holds the flyer, title, date, city and action bar.
    <div className="mx-auto flex max-w-content items-center justify-between px-4 md:px-6 lg:px-8 lg:py-2">
      <Link to="/map" className={buttonClasses("ghost", "sm")}>
        <ArrowLeft size={16} weight="bold" aria-hidden />
        {t("jam.backToMap")}
      </Link>
      <div className="flex items-center gap-1">
        {jam.can_edit && (
          <Link
            to={`/org/jams/${jam.id}/edit`}
            className={buttonClasses("ghost", "sm")}
          >
            <PencilSimple size={16} weight="bold" aria-hidden />
            {t("jam.edit")}
          </Link>
        )}
        {/* Wrappers, not classes on the button: its own `inline-flex` would race `hidden`. */}
        <span className="lg:hidden">
          <ShareButton title={title} look="icon" />
        </span>
        <span className="hidden lg:block">
          <ShareButton title={title} />
        </span>
      </div>
    </div>
  );
}

/** The meta lines: date and first start, city and country, all prizes; one row from lg. */
function Meta({ jam, battles }: { jam: Jam; battles: Schemas["Battle"][] }) {
  const { t, i18n } = useTranslation();
  const prizes = totalPrizes(battles, i18n.language);
  const line = "flex items-center gap-2 text-body";
  const icon = { size: 20, weight: "bold" as const, "aria-hidden": true };
  return (
    <ul className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:gap-x-6 lg:gap-y-2">
      <li className={line}>
        <CalendarBlank {...icon} className="shrink-0 text-primary-text" />
        {/* Phones get the short date, so the line fits on the first screen. */}
        <span className="lg:hidden">
          <When jam={jam} battles={battles} style="short" />
        </span>
        <span className="hidden lg:inline">
          <When jam={jam} battles={battles} />
        </span>
      </li>
      <li className={line}>
        <Flag code={jam.country} size="bare" />
        {jam.city}, {countryName(jam.country, i18n.language)}
      </li>
      {prizes && (
        <li className={line}>
          <Trophy {...icon} className="shrink-0 text-primary-text" />
          {t("jam.prizes", { amount: prizes })}
        </li>
      )}
    </ul>
  );
}

/** "Saturday 8 June 2030 · from 14:00", or short ("Sat 8 Jun · from 14:00"): the days, and the
 * first battle's start when known. */
function When({
  jam,
  battles,
  style = "long",
}: {
  jam: Jam;
  battles: Schemas["Battle"][];
  style?: "long" | "short";
}) {
  const { t, i18n } = useTranslation();
  const format = style === "short" ? formatShortDateRange : formatDateRange;
  const dates = format(jam.starts_on, jam.ends_on, i18n.language);
  const start = firstStart(battles);
  if (!start) return dates;
  const time = formatBattleStart(start, true, i18n.language);
  return `${dates} · ${t("jam.startsAt", { time })}`;
}

/** The facts grid's When and Where (desktop). */
function WhenWhere({
  jam,
  battles,
}: {
  jam: Jam;
  battles: Schemas["Battle"][];
}) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <Fact
        icon={<CalendarBlank size={20} weight="bold" />}
        label={t("jam.when")}
      >
        <When jam={jam} battles={battles} />
      </Fact>
      <Fact icon={<MapPin size={20} weight="bold" />} label={t("jam.where")}>
        {[jam.venue_name, jam.city].filter(Boolean).join(" · ")},{" "}
        {countryName(jam.country, i18n.language)}
      </Fact>
    </>
  );
}

/** Website, email and Instagram, each when set: in the facts grid, or under Info on phones. */
function Links({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  return (
    <>
      {jam.website_url && (
        <Fact icon={<Globe size={20} weight="bold" />} label={t("jam.website")}>
          <ExternalLink variant="fact" href={jam.website_url}>
            {instagramLabel(jam.website_url)}
          </ExternalLink>
        </Fact>
      )}
      {jam.contact_email && (
        <Fact
          icon={<EnvelopeSimple size={20} weight="bold" />}
          label={t("jam.email")}
        >
          <a
            href={`mailto:${jam.contact_email}`}
            className="inline-flex min-h-11 items-center self-start font-bold break-all text-primary-text underline-offset-2 hover:underline"
          >
            {jam.contact_email}
          </a>
        </Fact>
      )}
      {jam.instagram_url && (
        <Fact
          icon={<InstagramLogo size={20} weight="bold" />}
          label={t("jam.instagram")}
        >
          <ExternalLink variant="fact" href={jam.instagram_url}>
            {instagramLabel(jam.instagram_url)}
          </ExternalLink>
        </Fact>
      )}
    </>
  );
}

/** The venue: a static mini map when the jam has a pin, the address, and Directions. */
function Venue({ jam }: { jam: Jam }) {
  const { t, i18n } = useTranslation();
  if (!jam.venue_name && !jam.address && jam.lat == null) return null;
  const pin =
    jam.lat != null && jam.lng != null ? { lat: jam.lat, lng: jam.lng } : null;
  // Apple devices open Apple Maps; everything else, Google Maps.
  const maps = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
    ? "apple"
    : "google";
  return (
    <Section title={t("jam.venue")}>
      {pin && (
        <Suspense
          fallback={<Skeleton className="h-[170px] rounded-lg lg:h-[220px]" />}
        >
          <VenueMap lng={pin.lng} lat={pin.lat} />
        </Suspense>
      )}
      <address className="flex flex-col gap-1 text-body not-italic">
        {jam.venue_name && <span className="font-bold">{jam.venue_name}</span>}
        {jam.address && <span>{jam.address}</span>}
        <span>
          {jam.city}, {countryName(jam.country, i18n.language)}
        </span>
      </address>
      {pin && (
        <a
          href={directionsUrl(pin, maps)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClasses("secondary", "sm")} self-start`}
        >
          <NavigationArrow size={16} weight="bold" aria-hidden />
          {t("jam.directions")}
        </a>
      )}
    </Section>
  );
}

/** Who runs it (DESIGN.md §6 Jam detail, Organiser): initials, name, their jams, and Contact,
 * which writes to the jam's public email, else opens an Instagram DM. */
function OrganizerCard({
  organizer,
  email,
}: {
  organizer: NonNullable<Jam["organizer"]>;
  email: string | null | undefined;
}) {
  const { t } = useTranslation();
  const handle = organizer.instagram_handle;
  const meta = [
    t("jam.organiserJams", { count: organizer.jams }),
    handle && `@${handle}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const contact = email
    ? { href: `mailto:${email}` }
    : handle
      ? {
          href: `https://ig.me/m/${handle}`,
          target: "_blank",
          rel: "noopener noreferrer",
        }
      : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <span
        aria-hidden
        className="grid size-[52px] shrink-0 place-items-center rounded-[16px] bg-primary font-display text-[18px] font-extrabold text-on-primary"
      >
        {initialsOf(organizer.display_name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Link
            to={`/organizers/${organizer.id}`}
            className="truncate text-body font-extrabold underline-offset-2 hover:underline"
          >
            {organizer.display_name}
          </Link>
          {organizer.verified && <VerifiedTick />}
        </div>
        <p className="truncate text-body-sm text-muted">{meta}</p>
      </div>
      {contact && (
        // Full width on phones, where it wraps under the name.
        <a
          {...contact}
          className={`${buttonClasses("secondary", "sm")} w-full sm:w-auto`}
        >
          {email ? (
            <EnvelopeSimple size={16} weight="bold" aria-hidden />
          ) : (
            <InstagramLogo size={16} weight="bold" aria-hidden />
          )}
          {t("jam.contact")}
        </a>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  /** An anchor for links within the page ("See results", "Who's in"). */
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="font-display text-display-md">{title}</h2>
      {children}
    </section>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 text-primary-text">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <dt className="text-label text-muted uppercase">{label}</dt>
        <dd className="text-body">{children}</dd>
      </div>
    </div>
  );
}
