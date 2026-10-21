import { GitMerge } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";
import { useMe } from "../auth/useMe";
import { AddHandleButton } from "../verify/AddHandleButton";
import { VerifyButton } from "../verify/VerifyButton";
import { DancerEditDialog } from "./DancerEditDialog";

/**
 * The dancer page's action, by state (DESIGN.md §6): nothing for visitors, "This is me" on
 * an unverified page, the pending pill while a claim waits, "Edit profile" for whoever may
 * edit, and the merge tool for admins.
 */
export function DancerActions({
  dancer,
}: {
  dancer: Schemas["DancerResponse"];
}) {
  const { t } = useTranslation();
  const me = useMe().data;
  const [editing, setEditing] = useState<"profile" | "handle" | null>(null);

  if (!me) return null;
  return (
    <div className="flex flex-col gap-3">
      {dancer.can_edit && !dancer.instagram_handle && (
        <AddHandleButton onClick={() => setEditing("handle")} />
      )}
      <VerifyButton
        kind="dancers"
        id={dancer.id}
        enabled={!dancer.verified_at}
        label={t("verify.thisIsMe")}
        conflict={t("verify.conflict")}
      />
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
      {editing && (
        <DancerEditDialog
          dancer={dancer}
          focusHandle={editing === "handle"}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
