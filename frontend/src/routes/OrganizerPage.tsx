import { MapPin } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import type { Schemas } from "../api/client";
import { InlineEmpty } from "../components/InlineEmpty";
import { JamRow } from "../components/JamRow";
import { ShareButton } from "../components/ShareButton";
import { StatusBadge } from "../components/StatusBadge";
import { DancerAvatar } from "../features/dancers/DancerAvatar";
import { IdentityCard } from "../features/dancers/IdentityCard";
import { OrganizerActions } from "../features/organizers/OrganizerActions";
import {
  useOrganizer,
  useOrganizerEvents,
} from "../features/organizers/queries";
import { NotFoundPage } from "./NotFoundPage";

/**
 * `/organizers/:id` (M12c): like a dancer page without battles, the organiser's card and
 * their jams, upcoming then past.
 */
export function OrganizerPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const organizer = useOrganizer(id);
  if (organizer.isPending) return null;
  if (organizer.isError)
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-danger">
        {t("errors.generic")}
      </p>
    );
  if (!organizer.data) return <NotFoundPage />;
  return <OrganizerDetail organizer={organizer.data} />;
}

function OrganizerDetail({
  organizer,
}: {
  organizer: Schemas["OrganizerResponse"];
}) {
  const { t } = useTranslation();
  const events = useOrganizerEvents(organizer.id);
  return (
    <div className="mx-auto max-w-content px-4 md:px-6 lg:px-8">
      <title>{`${organizer.display_name} · BreakingJam`}</title>
      <div className="flex items-center justify-end py-2">
        <ShareButton title={organizer.display_name} />
      </div>
      <div className="flex flex-col gap-8 pb-10 lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-12 lg:pb-20">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <IdentityCard
            name={organizer.display_name}
            verified={Boolean(organizer.verified_at)}
            flags={[organizer.country]}
            instagram={organizer.instagram_handle}
            avatar={
              <DancerAvatar
                dancer={{
                  id: organizer.id,
                  dancer_name: organizer.display_name,
                }}
              />
            }
          />
          {organizer.city && (
            <span className="inline-flex items-center gap-1.5 text-body-sm text-muted">
              <MapPin size={16} weight="bold" aria-hidden />
              {organizer.city}
            </span>
          )}
          {organizer.bio && (
            <p className="text-body whitespace-pre-line">{organizer.bio}</p>
          )}
          <OrganizerActions organizer={organizer} />
        </aside>
        <div className="flex flex-col gap-10">
          <JamSection
            title={t("dancer.upcoming")}
            jams={events.data?.upcoming}
            empty={t("organizer.noUpcoming")}
          />
          <JamSection
            title={t("dancer.past")}
            jams={events.data?.past}
            empty={t("organizer.noPast")}
          />
        </div>
      </div>
    </div>
  );
}

function JamSection({
  title,
  jams,
  empty,
}: {
  title: string;
  jams: Schemas["EventRef"][] | undefined;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-display-sm lg:text-display-md">
        {title}
      </h2>
      {jams?.length === 0 && <InlineEmpty>{empty}</InlineEmpty>}
      <ul>
        {jams?.map((jam) => (
          <li key={jam.id}>
            <JamRow
              jam={jam}
              to={`/jams/${jam.slug}`}
              trailing={<StatusBadge status={jam.status} />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
