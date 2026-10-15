import { Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { useToast } from "../../components/useToast";
import { PendingPill } from "../verify/PendingPill";
import { VerifyDialog } from "../verify/VerifyDialog";
import { OrganizerEditDialog } from "./OrganizerEditDialog";
import { useOpenOrganizerClaim, useOrganizerClaim } from "./queries";

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
  const toast = useToast();
  const handle = organizer.instagram_handle;
  const claimable =
    organizer.can_edit && Boolean(handle) && !organizer.verified_at;
  const claim = useOrganizerClaim(organizer.id, claimable);
  const openClaim = useOpenOrganizerClaim(organizer.id);
  const [verifying, setVerifying] = useState(false);
  const [editing, setEditing] = useState<"page" | "handle" | null>(null);

  if (!organizer.can_edit) return null;
  const pending =
    claim.data?.status === "pending" && claim.data.instagram_handle === handle
      ? claim.data
      : null;
  return (
    <div className="flex flex-col gap-3">
      {!handle && (
        <>
          <button
            type="button"
            onClick={() => setEditing("handle")}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-body-sm font-bold text-muted"
          >
            <Plus size={16} weight="bold" aria-hidden />
            <span className="border-b-[1.5px] border-dashed border-border-strong">
              {t("dancerEdit.addInstagram")}
            </span>
          </button>
          <p className="text-caption text-muted">{t("organizer.whyHandle")}</p>
        </>
      )}
      {pending ? (
        <PendingPill code={pending.code} />
      ) : (
        claimable &&
        claim.isSuccess && (
          <Button
            variant="secondary"
            className="w-full"
            loading={openClaim.isPending}
            onClick={() =>
              openClaim.mutate(undefined, {
                onSuccess: () => setVerifying(true),
                onError: () =>
                  toast({ kind: "error", message: t("errors.generic") }),
              })
            }
          >
            {t("organizer.verify")}
          </Button>
        )
      )}
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setEditing("page")}
      >
        {t("organizer.edit")}
      </Button>
      <VerifyDialog
        claim={openClaim.data ?? claim.data ?? null}
        open={verifying}
        onClose={() => setVerifying(false)}
      />
      <OrganizerEditDialog
        organizer={organizer}
        open={editing !== null}
        focusHandle={editing === "handle"}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
