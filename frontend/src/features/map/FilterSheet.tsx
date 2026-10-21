import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { FilterChips } from "./FilterChips";
import { type Filters, NO_FILTERS } from "./jams";

type FilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** Jams in the area with the current filters: the count on the primary button. */
  count: number;
};

/**
 * All filters grouped in a bottom sheet, < lg (DESIGN.md §4.9, short content). Chips apply
 * at once; the primary button only closes the sheet.
 */
export function FilterSheet({
  open,
  onClose,
  filters,
  onChange,
  count,
}: FilterSheetProps) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // §4.9: short dialogs start on the primary action.
      primary.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      // The dialog's own box is only reached through the scrim around the content.
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      className="mx-0 mt-auto mb-0 w-full max-w-none rounded-t-xl border-t border-border-strong bg-surface-raised p-0 text-text shadow-lg backdrop:bg-scrim"
    >
      <div className="flex flex-col gap-4 px-4 pt-2 pb-[max(28px,env(safe-area-inset-bottom))]">
        <span
          aria-hidden
          className="mx-auto h-1 w-9 rounded-full bg-border-strong"
        />
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-display-md">
            {t("map.filters")}
          </h2>
          <IconButton
            label={t("map.close")}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} weight="bold" aria-hidden />
          </IconButton>
        </div>
        <FilterChips filters={filters} onChange={onChange} variant="sheet" />
        <div className="mt-2 flex gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => onChange(NO_FILTERS)}
          >
            {t("map.clear")}
          </Button>
          <Button
            ref={primary}
            className="flex-[2]"
            onClick={() => dialog.current?.close()}
          >
            {t("map.showJams", { count })}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
