const STORAGE_KEY = "bj.reloadedForNewBuild";

/** Reloads at most this often, so a build that lacks a file shows its error instead of looping. */
const MIN_GAP_MS = 60_000;

/**
 * Reloads the page when a page file fails to load: after a deploy, a tab opened before it asks
 * for the old build's files, which are gone (the site answers them with index.html).
 */
export function reloadOnNewBuild(reload = () => window.location.reload()) {
  window.addEventListener("vite:preloadError", () => {
    if (mayReload()) reload();
  });
}

/** Whether no reload happened in the last minute of this tab, remembering this one. */
function mayReload() {
  try {
    const last = sessionStorage.getItem(STORAGE_KEY);
    if (last !== null && Date.now() - Number(last) < MIN_GAP_MS) return false;
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    return true;
  } catch {
    // Storage blocked: with nothing to stop a loop, the error shows instead.
    return false;
  }
}
