import { GitMerge, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";
import { useToast } from "../../components/useToast";
import { useMe } from "../auth/useMe";
import { ClaimError, useMyClaim, useOpenClaim } from "./claims";
import { DancerEditDialog } from "./DancerEditDialog";
import { PendingPill } from "../verify/PendingPill";
import { VerifyDialog } from "../verify/VerifyDialog";

type Dancer = Schemas["DancerResponse"];

/**
 * The dancer page's action, by state (DESIGN.md §6): nothing for visitors, "This is me" on
 * an unverified page, the pending pill while a claim waits, "Edit profile" for whoever may
 * edit, and the merge tool for admins.
 */
export function DancerActions({ dancer }: { dancer: Dancer }) {
  const { t } = useTranslation();
  const toast = useToast();
  const me = useMe().data;
  const claimable = Boolean(me) && !dancer.verified_at;
  const claim = useMyClaim(dancer.id, claimable);
  const openClaim = useOpenClaim(dancer.id);
  const [verifying, setVerifying] = useState(false);
  const [editing, setEditing] = useState<"profile" | "handle" | null>(null);

  if (!me) return null;
  const pending = claim.data?.status === "pending" ? claim.data : null;
  const thisIsMe = () =>
    openClaim.mutate(undefined, {
      onSuccess: () => setVerifying(true),
      onError: (error) =>
        toast({
          kind: "error",
          message:
            error instanceof ClaimError && error.status === 409
              ? t("verify.conflict")
              : t("errors.generic"),
        }),
    });

  return (
    <div className="flex flex-col gap-3">
      {dancer.can_edit && !dancer.instagram_handle && (
        // §4.23: an optional field the viewer could fill in.
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
            onClick={thisIsMe}
          >
            {t("verify.thisIsMe")}
          </Button>
        )
      )}
      {dancer.can_edit && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setEditing("profile")}
        >
          {t("dancerEdit.open")}
        </Button>
      )}
      {me.role === "admin" && (
        <Link
          to={`/admin/dancers/${dancer.id}/merge`}
          className={`${buttonClasses("ghost", "sm")} self-start`}
        >
          <GitMerge size={16} weight="bold" aria-hidden />
          {t("admin.merge.link")}
        </Link>
      )}
      <VerifyDialog
        claim={openClaim.data ?? claim.data ?? null}
        open={verifying}
        onClose={() => setVerifying(false)}
      />
      <DancerEditDialog
        dancer={dancer}
        open={editing !== null}
        focusHandle={editing === "handle"}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
