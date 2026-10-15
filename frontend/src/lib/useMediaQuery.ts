import { useSyncExternalStore } from "react";

/** Whether a CSS media query matches, kept live; `false` where `matchMedia` is missing (tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
  );
}
