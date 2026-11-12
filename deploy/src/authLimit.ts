// Attempt limits in front of the sign-in routes (ARCHITECTURE §9): each login, register or
// reset costs the API a password hash, and it runs two at a time. Counted here, a flood is
// refused before it reaches the API's queue.

/** A Cloudflare rate-limit binding: `success` is false once `key` is over its limit. */
export type Limiter = Pick<RateLimit, "limit">;

/** Seconds a refused client is told to wait: the window of both limits in wrangler.jsonc. */
const WINDOW = 60;

/** The routes that hash a password. Codes and emails have their own limits in the API. */
const COUNTED = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/password/reset",
]);

/** The largest body read here to find its email; a real one is a few hundred bytes. */
const MAX_BODY = 4096;

/** Whether the request is one the limits count: a POST to a route that hashes a password. */
export function isAuthAttempt(request: Request): boolean {
  return (
    request.method === "POST" && COUNTED.has(new URL(request.url).pathname)
  );
}

/** The counter key of the account the attempt names; none when the body names no email. */
export function emailOf(body: unknown): string | null {
  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== "string") return null;
  // Folds more than the API does when it matches an account (trimmed, any case): two
  // spellings of one account must never get two counters, while two accounts sharing one
  // only share their tries. So no spaces, invisible characters, accents or case at all.
  const key = email
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\s\p{C}\p{Z}\p{M}]/gu, "");
  return key || null;
}

/** The refusal of an attempt that is over a limit; null when it may go on to the API. */
export async function refusal(
  request: Request,
  byIp: Limiter,
  byEmail: Limiter,
): Promise<Response | null> {
  // The body is read below, whole: without a small, known size it could fill the Worker's memory.
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!(length <= MAX_BODY)) {
    return refused(413, "payload_too_large", "request body too large");
  }
  // Set by Cloudflare's edge, so a client can't choose it; absent only in local development.
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  // The address first: one over its limit must not also use up the tries of the emails it names.
  if (!(await byIp.limit({ key: ip })).success) return tooManyAttempts();
  // A copy, as the API still has to read the body.
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  const email = emailOf(body);
  if (email !== null && !(await byEmail.limit({ key: email })).success) {
    return tooManyAttempts();
  }
  return null;
}

/** 429, telling the client when to try again. */
function tooManyAttempts(): Response {
  const message = "too many attempts, try again in a minute";
  const response = refused(429, "too_many_requests", message);
  response.headers.set("retry-after", String(WINDOW));
  return response;
}

/** A refusal in the API's error envelope, so the forms read it like any other. */
function refused(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}
