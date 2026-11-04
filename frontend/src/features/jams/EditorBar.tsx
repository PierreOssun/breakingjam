import { Check, CircleNotch, Eye, WarningCircle } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { buttonClasses } from "../../components/buttonClasses";
import { StatusBadge } from "../../components/StatusBadge";
import type { ChecklistItem } from "./jamFields";
import { PublishButton } from "./PublishPanel";
import type { SaveState } from "./useAutosave";

type Jam = Schemas["EventResponse"];

/** The bar under the header while editing (M24): status, whether the last edit is saved,
 * Preview, and on desktop the Publish button of a draft. */
export function EditorBar({
  jam,
  state,
  items,
  action,
  onFix,
}: {
  jam: Jam;
  state: SaveState;
  /** The publish checklist, once the battles are known. */
  items: ChecklistItem[] | undefined;
  /** What "Not saved" offers: go to the field at fault, or try again. */
  action: "fix" | "retry";
  onFix: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-14 z-10 border-b border-border bg-surface lg:top-16">
      <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-2.5 md:px-6 lg:px-8">
        <StatusBadge jam={jam} />
        <span className="hidden text-body font-bold sm:inline">
          {t("org.editor.editing")}
        </span>
        <SaveIndicator state={state} action={action} onFix={onFix} />
        <span className="flex-1" />
        <Link
          to={`/jams/${jam.slug}`}
          className={buttonClasses("secondary", "sm")}
        >
          <Eye size={16} weight="bold" aria-hidden />
          {t("org.editor.preview")}
        </Link>
        {jam.status === "draft" && items && (
          <span className="hidden lg:inline-flex">
            <PublishButton jam={jam} items={items} />
          </span>
        )}
      </div>
    </div>
  );
}

/** "Saved", "Saving…" or "Not saved" with what to do about it, announced as it changes. */
function SaveIndicator({
  state,
  action,
  onFix,
}: {
  state: SaveState;
  action: "fix" | "retry";
  onFix: () => void;
}) {
  const { t } = useTranslation();
  const icon = { size: 16, weight: "bold" as const, "aria-hidden": true };
  return (
    <span aria-live="polite" className="text-body-sm font-bold text-muted">
      {state === "error" ? (
        <button
          type="button"
          onClick={onFix}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-danger"
        >
          <WarningCircle {...icon} />
          {t("org.editor.notSaved")}{" "}
          <span className="underline">{t(`org.editor.${action}`)}</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {state === "saving" ? (
            <CircleNotch {...icon} className="motion-safe:animate-spin" />
          ) : (
            <Check {...icon} className="text-success" />
          )}
          {t(`org.editor.${state}`)}
        </span>
      )}
    </span>
  );
}
