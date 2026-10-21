import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { AddHandleButton } from "../verify/AddHandleButton";
import { VerifyButton } from "../verify/VerifyButton";
import { OrganizerEditDialog } from "./OrganizerEditDialog";

/**
 * The owner's actions on their organiser page: add the handle, verify it (the same code and
 * review as dancers, §4), and edit the page. Visitors see none of it.
 */
export function OrganizerActions({
  organizer,
}: {
  organizer: Schemas["OrganizerResponse"];
}) {
  const { t } = useTranslation();
  const handle = organizer.instagram_handle;
  const [editing, setEditing] = useState<"page" | "handle" | null>(null);

  if (!organizer.can_edit) return null;
  return (
    <div className="flex flex-col gap-3">
      {!handle && (
        <>
          <AddHandleButton onClick={() => setEditing("handle")} />
          <p className="text-caption text-muted">{t("organizer.whyHandle")}</p>
        </>
      )}
      <VerifyButton
        kind="organizers"
        id={organizer.id}
        enabled={Boolean(handle) && !organizer.verified_at}
        handle={handle}
        label={t("organizer.verify")}
      />
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setEditing("page")}
      >
        {t("organizer.edit")}
      </Button>
      {editing && (
        <OrganizerEditDialog
          organizer={organizer}
          focusHandle={editing === "handle"}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
