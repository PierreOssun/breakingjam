import { X } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `short`: auto height, 480px wide from lg · `form`: tall sheet, 560px wide from lg. */
  size?: "short" | "form";
  /** Asked before closing with unsaved edits (§4.9); the dialog stays open when declined. */
  confirmClose?: string;
  /** Sticks to the bottom, under a border; a function gets `close`, which asks first too. */
  footer?: ReactNode | ((close: () => void) => ReactNode);
  children: ReactNode;
};

/**
 * One component that changes shape by viewport (DESIGN.md §4.9): a bottom sheet below lg,
 * a centred dialog from lg. The native `<dialog>` traps focus and restores it on close;
 * focus starts on `[data-autofocus]` when a child has it.
 */
export function Dialog({
  open,
  onClose,
  title,
  size = "short",
  confirmClose,
  footer,
  children,
}: DialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
      onClose={onClose}
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
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("dialog.close")}
          onClick={requestClose}
          className="shrink-0"
        >
          <X size={20} weight="bold" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pt-2 pb-6 lg:px-6">
        {children}
      </div>
      {footer && (
        <div className="flex gap-3 border-t border-border px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:justify-end lg:px-6 lg:pb-6">
          {typeof footer === "function" ? footer(requestClose) : footer}
        </div>
      )}
    </dialog>
  );
}
