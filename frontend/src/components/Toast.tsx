import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./IconButton";
import { ToastContext, type ToastMessage } from "./useToast";

const ICONS = {
  success: <CheckCircle size={22} weight="bold" className="text-success" />,
  error: <WarningCircle size={22} weight="bold" className="text-danger" />,
  info: <Info size={22} weight="bold" className="text-primary-text" />,
};

/** Holds the toast queue for the pages below it and shows the first one (DESIGN.md §4.8). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<(ToastMessage & { id: number })[]>([]);
  const nextId = useRef(0);
  const show = useCallback((toast: ToastMessage) => {
    nextId.current += 1;
    const id = nextId.current;
    setQueue((q) => [...q, { ...toast, id }]);
  }, []);
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const current = queue[0];
  return (
    <ToastContext.Provider value={show}>
      {children}
      {current && (
        // A key per message restarts the timer and the entrance for the next one.
        <Toast key={current.id} toast={current} onDismiss={dismiss} />
      )}
    </ToastContext.Provider>
  );
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.kind === "error" || paused) return;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [toast, paused, onDismiss]);

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border border-border-strong bg-surface-raised py-3 pr-2 pl-4 shadow-lg motion-safe:animate-[toast-in_180ms_ease-out] motion-reduce:animate-[fade-in_180ms_ease-out] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-toast"
    >
      <span aria-hidden className="shrink-0">
        {ICONS[toast.kind]}
      </span>
      <p className="flex-1 text-body-sm font-bold">{toast.message}</p>
      <IconButton label={t("dialog.dismiss")} onClick={onDismiss}>
        <X size={20} weight="bold" aria-hidden />
      </IconButton>
    </div>
  );
}
