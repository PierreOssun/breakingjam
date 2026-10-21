import { Plus } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** "Add Instagram": an optional field the viewer could fill in (DESIGN.md §4.23). */
export function AddHandleButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-body-sm font-bold text-muted"
    >
      <Plus size={16} weight="bold" aria-hidden />
      <span className="border-b-[1.5px] border-dashed border-border-strong">
        {t("dancerEdit.addInstagram")}
      </span>
    </button>
  );
}
