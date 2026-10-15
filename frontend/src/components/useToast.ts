import { createContext, useContext } from "react";

/** One message of DESIGN.md §4.8: success and info fade after 5 s, errors stay. */
export type ToastMessage = {
  kind: "success" | "error" | "info";
  message: string;
};

export const ToastContext = createContext<(toast: ToastMessage) => void>(
  () => undefined,
);

/** Shows a toast; one at a time, the rest wait their turn. */
export function useToast() {
  return useContext(ToastContext);
}
