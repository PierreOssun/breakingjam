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
 * Where a new account goes after `next`: anywhere but the jam form, as it may only dance or
 * watch (mirrors the API's `after_sign_up`, which does the same for Google sign-ups).
 */
export function afterSignUp(next: string): string {
  return next === "/org/jams/new" ? "/" : next;
}

/** `path?next=…`, the way login, register and the Google redirect carry the return page. */
export function withNext(path: string, next: string): string {
  return `${path}?next=${encodeURIComponent(next)}`;
}
