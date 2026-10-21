import { X } from "@phosphor-icons/react";
import { type ReactNode, useId, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

/** The footer's primary button: what it says and what it does; Cancel beside it closes. */
export type DialogAction = {
  label: string;
  /** The Cancel button's text when not "Cancel". */
  cancel?: string;
  loading?: boolean;
  disabled?: boolean;
} & ({ form: string } | { onClick: () => void });

type DialogProps = {
  onClose: () => void;
  title: string;
  /** `short`: auto height, 480px wide from lg · `form`: tall sheet, 560px wide from lg. */
  size?: "short" | "form";
  /** Asked before closing with unsaved edits (§4.9); the dialog stays open when declined. */
  confirmClose?: string;
  /** Sticks to the bottom, under a border. */
  action?: DialogAction;
  children: ReactNode;
};

/**
 * One component that changes shape by viewport (DESIGN.md §4.9): a bottom sheet below lg,
 * a centred dialog from lg. Open while mounted; the native `<dialog>` traps focus and
 * restores it on close. Focus starts on `[data-autofocus]` when a child has it.
 */
export function Dialog({
  onClose,
  title,
  size = "short",
  confirmClose,
  action,
  children,
}: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // A layout effect, so the dialog also closes (and gives focus back) before it is removed.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => dialog.close();
  }, []);

  const requestClose = () => {
    if (confirmClose && !window.confirm(confirmClose)) return;
    ref.current?.close();
  };

  const shape =
    size === "form"
      ? "h-[calc(100dvh-40px)] lg:h-auto lg:w-[560px]"
      : "lg:w-[480px]";
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={(e) => {
        // StrictMode and Fast Refresh close and reopen on mount; that stale `close` event
        // arrives once the dialog is open again and must not close it for good.
        if (!e.currentTarget.open) onClose();
      }}
      onCancel={(e) => {
        // Esc: same question as the close button.
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        // Only the scrim around the content reaches the dialog element itself.
        if (e.target === e.currentTarget) requestClose();
      }}
      className={`mx-0 mt-auto mb-0 max-h-[calc(100dvh-40px)] w-full max-w-none flex-col rounded-t-xl border-t border-border-strong bg-surface-raised p-0 text-text shadow-lg backdrop:bg-scrim open:flex lg:m-auto lg:mt-[12vh] lg:max-h-[80vh] lg:rounded-lg lg:border ${shape}`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 lg:px-6 lg:pt-6">
        <h2 id={titleId} className="font-display text-display-md">
          {title}
        </h2>
        <IconButton label={t("dialog.close")} onClick={requestClose}>
          <X size={20} weight="bold" aria-hidden />
        </IconButton>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pt-2 pb-6 lg:px-6">
        {children}
      </div>
      {action && (
        <div className="flex gap-3 border-t border-border px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:justify-end lg:px-6 lg:pb-6">
          <Button
            variant="ghost"
            className="flex-1 lg:flex-none"
            onClick={requestClose}
          >
            {action.cancel ?? t("form.cancel")}
          </Button>
          <Button
            {...("form" in action
              ? { type: "submit", form: action.form }
              : { onClick: action.onClick, "data-autofocus": true })}
            className="flex-[2] lg:flex-none"
            loading={action.loading}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        </div>
      )}
    </dialog>
  );
}
