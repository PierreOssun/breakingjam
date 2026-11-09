/** Only same-site paths: `/x` yes, `//evil.com`, `https://…` and backslashes no (mirrors the API). */
export function safeNext(next: string | null): string {
  const isControl = (c: string) =>
    c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f;
  const ok =
    next !== null &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    ![...next].some(isControl);
  return ok ? next : "/";
}

/**
 * Where a new account goes: the welcome step (M25), then `next`, anywhere but the jam form, as
 * it may only dance or watch (mirrors the API's `after_sign_up`, which does the same for Google
 * sign-ups).
 */
export function afterSignUp(next: string): string {
  return withNext("/welcome", next === "/org/jams/new" ? "/" : next);
}

/**
 * The page a sign-up's welcome step leads on to, so a page between sign-up and welcome (the code
 * entry) can send someone back to log in without passing the welcome step along; `next` itself
 * otherwise.
 */
export function beyondWelcome(next: string): string {
  const url = new URL(next, "https://x");
  return url.pathname === "/welcome"
    ? safeNext(url.searchParams.get("next"))
    : next;
}

/** `path?next=…`, the way login, register and the Google redirect carry the return page. */
export function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(next)}`;
}
