import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { VerifiedTick } from "../../components/VerifiedTick";
import { useMe } from "../auth/useMe";
import { DancerAvatar } from "../dancers/DancerAvatar";
import { OrganizerEditDialog } from "../organizers/OrganizerEditDialog";
import { useOrganizer } from "../organizers/queries";
import { initialsOf } from "./jamDetail";

/** Who runs the jam, in the editor: the account, with "Change" opening its organiser page. */
export function OrganizerCard({ jam }: { jam: Schemas["EventResponse"] }) {
  const { t } = useTranslation();
  const me = useMe().data;
  const organizer = useOrganizer(jam.organizer_id).data;
  const [editing, setEditing] = useState(false);
  const mine = me?.id === jam.organizer_id;
  const name = organizer?.display_name ?? jam.organizer?.display_name ?? "";
  const handle = organizer?.instagram_handle;
  return (
    <section aria-labelledby="organiser-title" className="flex flex-col gap-3">
      <h2 id="organiser-title" className="text-label text-muted uppercase">
        {t("jam.organiser")}
      </h2>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
        {mine && me?.dancer ? (
          <DancerAvatar dancer={me.dancer} size="row" />
        ) : (
          <InitialsAvatar name={name} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-body font-extrabold">
            <span className="truncate">{name}</span>
            {organizer?.verified_at && <VerifiedTick />}
          </span>
          <span className="truncate text-body-sm text-muted">
            {mine ? t("org.editor.yourAccount") : handle && `@${handle}`}
          </span>
        </div>
        {organizer?.can_edit && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t("org.editor.change")}
          </Button>
        )}
      </div>
      {editing && organizer && (
        <OrganizerEditDialog
          organizer={organizer}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

/** A 52px rounded square with the organiser's initials, while organisers have no logo. */
export function InitialsAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-[52px] shrink-0 place-items-center rounded-[16px] bg-primary font-display text-[18px] font-extrabold text-on-primary"
    >
      {initialsOf(name)}
    </span>
  );
}
