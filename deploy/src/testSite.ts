// UAT's "Test site" banner: closable once per browser, without JavaScript (the CSP allows none
// inline). Its close button is a link the Worker answers with a cookie and a way back.

/** The path the banner's close button links to. */
export const CLOSE_PATH = "/_test-site/close";
const COOKIE = "bj_test_banner=closed";

// Inline styles from the theme's tokens: the banner is not part of the app's build. Fixed and
// click-through, so UAT keeps production's layout; only the close button takes clicks.
export const TEST_BANNER =
  '<div role="note" style="position:fixed;left:12px;bottom:max(12px,env(safe-area-inset-bottom));' +
  "z-index:2147483647;pointer-events:none;max-width:calc(100% - 24px);display:flex;" +
  "align-items:center;gap:0.5rem;border-radius:999px;padding:0.75rem 0.75rem 0.75rem 1.5rem;" +
  "background:var(--color-accent);color:var(--color-on-primary);" +
  'font:600 1.625rem/1.3 var(--font-body);box-shadow:0 2px 8px rgb(0 0 0 / 0.3)">' +
  "<span>Test site — demo data, not real jams</span>" +
  `<a href="${CLOSE_PATH}" aria-label="Close the test-site notice" style="pointer-events:auto;` +
  "display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:999px;" +
  'color:inherit;text-decoration:none;font-size:1.75rem;line-height:1">×</a></div>';

/** Whether this browser already closed the banner. */
export function bannerClosed(request: Request): boolean {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(/;\s*/).includes(COOKIE);
}

/** Remembers the closed banner for a year and goes back to the page it was closed on. */
export function closeBanner(request: Request): Response {
  const url = new URL(request.url);
  // Only a page of this site: an outside Referer must not turn this into an open redirect.
  const from = URL.parse(request.headers.get("referer") ?? "");
  const back = from?.origin === url.origin ? from.pathname + from.search : "/";
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      location: back,
      "set-cookie": `${COOKIE}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`,
    },
  });
}

/**
 * A page request that can't be answered "304 Not Modified": the banner depends on a cookie the
 * static files know nothing about, so a revalidated page would bring it back from the cache.
 */
export function withoutRevalidation(request: Request): Request {
  if (!request.headers.get("accept")?.includes("text/html")) return request;
  const fresh = new Request(request);
  fresh.headers.delete("if-none-match");
  fresh.headers.delete("if-modified-since");
  return fresh;
}
