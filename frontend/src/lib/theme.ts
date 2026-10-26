import { useSyncExternalStore } from "react";

/** Light, dark, or `auto`: the OS setting (`prefers-color-scheme`). */
export type Theme = "light" | "dark" | "auto";

export const THEMES: readonly Theme[] = ["light", "dark", "auto"];

const STORAGE_KEY = "bj.theme";
const listeners = new Set<() => void>();
let current = saved();

function saved(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.find((theme) => theme === value) ?? "auto";
  } catch {
    // Storage can be blocked (private mode): the OS setting.
    return "auto";
  }
}

/** Puts the chosen theme on the page: `[data-theme]` picks the tokens (src/styles/index.css). */
export function applyTheme() {
  const root = document.documentElement;
  if (current === "auto") delete root.dataset.theme;
  else root.dataset.theme = current;
}

/** Switches the theme and remembers it on this device. */
export function setTheme(theme: Theme) {
  current = theme;
  applyTheme();
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered, but the switch still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

/** The chosen theme; re-renders when it changes. */
export function useTheme() {
  return useSyncExternalStore(subscribe, () => current);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
