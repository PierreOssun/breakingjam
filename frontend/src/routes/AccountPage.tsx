import { PencilSimple } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { buttonClasses } from "../components/buttonClasses";
import { VerifiedTick } from "../components/VerifiedTick";
import { withNext } from "../features/auth/safeNext";
import { useMe } from "../features/auth/useMe";
import { DancerAvatar } from "../features/dancers/DancerAvatar";
import { DancerEditDialog } from "../features/dancers/DancerEditDialog";
import { useDancer } from "../features/dancers/queries";
import { OrganizerEditDialog } from "../features/organizers/OrganizerEditDialog";
import { useOrganizer } from "../features/organizers/queries";

/** `/account`: the stage name (the account's own dancer page), the organiser name and the sign-in. */
export function AccountPage() {
  const { t } = useTranslation();
  // RequireAuth has loaded the account before this page renders.
  const me = useMe().data;
  if (!me) return null;
  return (
    <section className="mx-auto flex w-full max-w-prose flex-col gap-6 px-4 py-10 md:px-6 lg:py-16">
      <title>{`${t("accountPage.title")} · BreakingJam`}</title>
      <h1 className="font-display text-display-lg">{t("accountPage.title")}</h1>
      {me.dancer ? (
        <StageName id={me.dancer.id} />
      ) : (
        <Card label={t("accountPage.stageName")}>
          <p className="text-body text-muted">{t("accountPage.noPage")}</p>
          <Link
            to={withNext("/welcome", "/account")}
            className={`${buttonClasses("secondary", "sm")} self-start`}
          >
            {t("account.findPage")}
          </Link>
        </Card>
      )}
      {/* A plain user has no organiser page until their first jam. */}
      {me.role !== "user" && <OrganiserName id={me.id} />}
      <Card label={t("accountPage.signIn")}>
        <p className="text-body font-bold break-all">{me.email}</p>
        <Link
          to={withNext("/forgot-password", "/account")}
          state={{ email: me.email }}
          className={`${buttonClasses("secondary", "sm")} self-start`}
        >
          {t("accountPage.changePassword")}
        </Link>
      </Card>
    </section>
  );
}

/** The account's own dancer page: its name, which is the account's stage name, and Edit. */
function StageName({ id }: { id: string }) {
  const { t } = useTranslation();
  const dancer = useDancer(id).data;
  const [editing, setEditing] = useState(false);
  // An own page merged away leaves the account without one until `me` catches up.
  if (!dancer || "merged_into" in dancer) return null;
  return (
    <Card label={t("accountPage.stageName")}>
      <div className="flex items-center gap-3">
        <DancerAvatar dancer={dancer} size="row" />
        <Link
          to={`/dancers/${dancer.id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 font-display text-display-sm"
        >
          <span className="truncate underline">{dancer.dancer_name}</span>
          {dancer.verified_at && <VerifiedTick />}
        </Link>
        <EditButton onClick={() => setEditing(true)} />
      </div>
      {editing && (
        <DancerEditDialog dancer={dancer} onClose={() => setEditing(false)} />
      )}
    </Card>
  );
}

/** The name the account's jams show as their organiser. */
function OrganiserName({ id }: { id: string }) {
  const { t } = useTranslation();
  const organizer = useOrganizer(id).data;
  const [editing, setEditing] = useState(false);
  if (!organizer) return null;
  return (
    <Card label={t("accountPage.organiserName")}>
      <div className="flex items-center gap-3">
        <Link
          to={`/organizers/${organizer.id}`}
          className="min-w-0 flex-1 truncate text-body font-extrabold underline"
        >
          {organizer.display_name}
        </Link>
        <EditButton onClick={() => setEditing(true)} />
      </div>
      <p className="text-body-sm text-muted">
        {t("auth.fields.displayNameHint")}
      </p>
      {editing && (
        <OrganizerEditDialog
          organizer={organizer}
          onClose={() => setEditing(false)}
        />
      )}
    </Card>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-label text-muted uppercase">{label}</h2>
      {children}
    </section>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <PencilSimple size={16} weight="bold" aria-hidden />
      {t("org.editor.edit")}
    </Button>
  );
}
