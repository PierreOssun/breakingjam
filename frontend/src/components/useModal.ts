import { useLayoutEffect, useRef } from "react";

/** A native `<dialog>`'s ref: open as a modal while mounted, focus on its `[data-autofocus]`. */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  // A layout effect, so the dialog also closes (and gives focus back) before it is removed.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    // A frame later: StrictMode closes and reopens on mount, and a field focused before that
    // close is blurred by it, which marks it touched and shows "Required." on an empty form.
    const frame = requestAnimationFrame(() =>
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      dialog.close();
    };
  }, []);
  return ref;
}
