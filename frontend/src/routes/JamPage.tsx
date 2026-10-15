import {
  ArrowLeft,
  ArrowSquareOut,
  CalendarBlank,
  InstagramLogo,
  MapPin,
  PencilSimple,
  Play,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import type { Schemas } from "../api/client";
import { Button } from "../components/Button";
import { buttonClasses } from "../components/buttonClasses";
import { InlineEmpty } from "../components/InlineEmpty";
import { ResultBadge } from "../components/ResultBadge";
import { ShareButton } from "../components/ShareButton";
import { StatusBadge } from "../components/StatusBadge";
import { VerifiedTick } from "../components/VerifiedTick";
import { VideoDialog, type Video } from "../components/VideoDialog";
import { JamFlyer } from "../features/jams/JamFlyer";
import {
  useBattles,
  useEntries,
  useJam,
  useStaff,
} from "../features/jams/queries";
import { countryName } from "../lib/countries";
import { formatDateRange } from "../lib/dates";
import { instagramLabel } from "../lib/instagram";
import { NotFoundPage } from "./NotFoundPage";

type Jam = Schemas["EventResponse"];
type Entry = Schemas["Entry"];

// Where a result sorts: exact placement first, else the stage reached.
const STAGE_ORDER: Record<Schemas["BracketStage"], number> = {
  winner: 1,
  top2: 2,
  top4: 4,
  top8: 8,
  top16: 16,
  top32: 32,
  top64: 64,
  prelims: 100,
  na: 1000,
};

const ROLE_ORDER: Schemas["StaffRole"][] = [
  "judge",
  "dj",
  "mc",
  "organizer",
  "other",
];

/** `/jams/:slug`: a jam with its battles, entries, lineup and venue (DESIGN.md §6). */
export function JamPage() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const jam = useJam(slug);
  if (jam.isPending) return null;
  if (jam.isError)
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-danger">
        {t("errors.generic")}
      </p>
    );
  if (!jam.data) return <NotFoundPage />;
  return <JamDetail jam={jam.data} />;
}

function JamDetail({ jam }: { jam: Jam }) {
  const { t, i18n } = useTranslation();
  const [video, setVideo] = useState<Video | null>(null);
  const battles = useBattles(jam.id);
  const staff = useStaff(jam.id);
  const entries = useEntries((battles.data ?? []).map((b) => b.id));
  const registration = jam.status === "published" ? jam.registration_url : null;
  const dates = formatDateRange(jam.starts_on, jam.ends_on, i18n.language);

  return (
    <article className="pb-10 lg:pb-20">
      <title>{`${jam.name} · BreakingJam`}</title>
      <div className="mx-auto flex max-w-content items-center justify-between px-4 py-2 md:px-6 lg:px-8">
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
          <ShareButton title={jam.name} />
        </div>
      </div>

      <div className="mx-auto max-w-content lg:grid lg:grid-cols-[440px_1fr] lg:gap-16 lg:px-8">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          {/* Full-bleed below lg, a rounded card beside the content from lg. */}
          <JamFlyer jam={jam} className="lg:rounded-lg" />
          {registration && (
            <div className="hidden flex-col gap-4 rounded-lg border border-border bg-surface p-5 lg:flex">
              <p className="text-label text-primary-text uppercase">{dates}</p>
              <RegisterLink href={registration} className="w-full" />
            </div>
          )}
        </aside>

        <div className="flex max-w-prose flex-col gap-10 px-4 pt-6 md:px-6 lg:px-0 lg:pt-0">
          <header className="flex flex-col gap-3">
            <StatusBadge status={jam.status} />
            <h1 className="font-display text-display-lg break-words lg:text-display-2xl">
              {jam.name}
            </h1>
          </header>

          <dl className="grid gap-5 lg:grid-cols-2">
            <Fact
              icon={<CalendarBlank size={20} weight="bold" />}
              label={t("jam.dates")}
            >
              {dates}
            </Fact>
            <Fact
              icon={<MapPin size={20} weight="bold" />}
              label={t("jam.venue")}
            >
              {[jam.venue_name, jam.city].filter(Boolean).join(" · ")},{" "}
              {countryName(jam.country, i18n.language)}
            </Fact>
            {jam.instagram_url && (
              <Fact
                icon={<InstagramLogo size={20} weight="bold" />}
                label={t("jam.instagram")}
              >
                <ExternalLink href={jam.instagram_url}>
                  {instagramLabel(jam.instagram_url)}
                </ExternalLink>
              </Fact>
            )}
          </dl>

          <Section title={t("jam.battles")}>
            {battles.data?.length === 0 ? (
              <InlineEmpty>{t("jam.noBattles")}</InlineEmpty>
            ) : (
              <ul className="flex flex-col gap-4">
                {(battles.data ?? []).map((battle, index) => (
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

          {staff.data && staff.data.length > 0 && (
            <Section title={t("jam.lineup")}>
              <div className="flex flex-col gap-5">
                {ROLE_ORDER.map((role) => {
                  const people = staff.data.filter((s) => s.role === role);
                  if (people.length === 0) return null;
                  return (
                    <div key={role}>
                      <h3 className="mb-2 text-label text-muted uppercase">
                        {t(`jam.roles.${role}`)}
                      </h3>
                      <ul className="flex flex-wrap gap-2">
                        {people.map(({ dancer }) => (
                          <li key={dancer.id}>
                            <DancerChip dancer={dancer} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {jam.description && (
            <Section title={t("jam.about")}>
              <p className="text-body whitespace-pre-line">{jam.description}</p>
            </Section>
          )}

          {(jam.venue_name || jam.address || jam.lat != null) && (
            <Section title={t("jam.venue")}>
              <address className="flex flex-col gap-1 text-body not-italic">
                {jam.venue_name && (
                  <span className="font-bold">{jam.venue_name}</span>
                )}
                {jam.address && <span>{jam.address}</span>}
                <span>
                  {jam.city}, {countryName(jam.country, i18n.language)}
                </span>
              </address>
              {jam.lat != null && jam.lng != null && (
                <ExternalLink
                  href={`https://www.openstreetmap.org/?mlat=${jam.lat}&mlon=${jam.lng}#map=16/${jam.lat}/${jam.lng}`}
                >
                  {t("jam.openInMaps")}
                </ExternalLink>
              )}
            </Section>
          )}
          <Section title={t("jam.organiser")}>
            <OrganizerCard organizer={jam.organizer} />
          </Section>
        </div>
      </div>

      {/* Sticky, not fixed: it rides along while the jam is on screen and stops before the footer. */}
      {registration && (
        <div className="sticky bottom-0 z-30 mt-10 border-t border-border bg-bg px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-md lg:hidden">
          <RegisterLink href={registration} className="w-full" />
        </div>
      )}
      <VideoDialog video={video} onClose={() => setVideo(null)} />
    </article>
  );
}

function BattleCard({
  jam,
  battle,
  entries,
  onPlay,
}: {
  jam: Jam;
  battle: Schemas["Battle"];
  entries: Entry[] | undefined;
  onPlay: (video: Video) => void;
}) {
  const { t } = useTranslation();
  const active = (entries ?? []).filter((e) => e.status !== "withdrawn");
  const ranked = [...active].sort(
    (a, b) =>
      (a.final_rank ?? STAGE_ORDER[a.reached]) -
      (b.final_rank ?? STAGE_ORDER[b.reached]),
  );
  const spots =
    jam.status === "published" && battle.max_entries != null
      ? battle.max_entries - active.length
      : null;

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-display-xs">{battle.name}</h3>
        {spots !== null && (
          <span
            className={`text-body-sm ${spots > 0 ? "text-primary-text" : "text-muted"}`}
          >
            {spots > 0 ? t("jam.spotsLeft", { count: spots }) : t("jam.full")}
          </span>
        )}
      </div>
      {entries && ranked.length === 0 && (
        <p className="mt-2 text-body-sm text-muted">{t("jam.noEntries")}</p>
      )}
      {ranked.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {ranked.map((entry) => {
            const who =
              entry.team_name ??
              entry.members.map((m) => m.dancer_name).join(", ");
            return (
              <li key={entry.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  {entry.team_name && (
                    <p className="text-body font-extrabold">
                      {entry.team_name}
                    </p>
                  )}
                  <p className="text-body-sm">
                    {entry.members.map((member, i) => (
                      <span key={member.id}>
                        {i > 0 && ", "}
                        <Link
                          to={`/dancers/${member.id}`}
                          className="font-bold underline-offset-2 hover:underline"
                        >
                          {member.dancer_name}
                        </Link>
                      </span>
                    ))}
                    {entry.crew && (
                      <span className="text-muted"> · {entry.crew.name}</span>
                    )}
                  </p>
                </div>
                {entry.video_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("jam.watch", { name: who })}
                    onClick={() =>
                      onPlay({
                        url: entry.video_url ?? "",
                        offset: entry.video_offset_seconds,
                        name: `${battle.name} — ${who}`,
                      })
                    }
                  >
                    <Play size={20} weight="fill" aria-hidden />
                  </Button>
                )}
                <ResultBadge
                  finalRank={entry.final_rank}
                  reached={entry.reached}
                />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** DESIGN.md §6 jam detail, item 9: who runs it, and a way to reach them. */
function OrganizerCard({ organizer }: { organizer: Jam["organizer"] }) {
  const { t } = useTranslation();
  const handle = organizer.instagram_handle;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          to={`/organizers/${organizer.id}`}
          className="truncate text-body font-extrabold underline-offset-2 hover:underline"
        >
          {organizer.display_name}
        </Link>
        {organizer.verified && <VerifiedTick />}
      </div>
      {handle && (
        // An Instagram DM: organisers are reached where they already are.
        <a
          href={`https://ig.me/m/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("secondary", "sm")}
        >
          <InstagramLogo size={16} weight="bold" aria-hidden />
          {t("jam.contact")}
        </a>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
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

function DancerChip({ dancer }: { dancer: Schemas["DancerRef"] }) {
  return (
    <Link
      to={`/dancers/${dancer.id}`}
      className="relative inline-flex h-9 items-center rounded-full border border-border-strong px-3.5 text-body-sm font-bold text-text transition-colors duration-fast after:absolute after:-inset-1 after:content-[''] hover:bg-surface-raised"
    >
      {dancer.dancer_name}
    </Link>
  );
}

function RegisterLink({
  href,
  className,
}: {
  href: string;
  className: string;
}) {
  const { t } = useTranslation();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${buttonClasses("primary", "lg")} ${className}`}
    >
      {t("jam.register")}
      <ArrowSquareOut size={20} weight="bold" aria-hidden />
    </a>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 self-start font-bold text-primary-text underline-offset-2 hover:underline"
    >
      {children}
      <ArrowSquareOut size={16} weight="bold" aria-hidden />
    </a>
  );
}
