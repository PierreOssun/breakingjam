import {
  emailOf,
  isAuthAttempt,
  type Limiter,
  refusal,
} from "../src/authLimit";

/** A limiter allowing `limit` tries per key, and the keys it was asked about. */
function limiter(limit: number): Limiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }) => {
      keys.push(key);
      return { success: keys.filter((k) => k === key).length <= limit };
    },
  };
}

function login(email: unknown, ip = "203.0.113.7") {
  const body = JSON.stringify({ email, password: "x" });
  return new Request("https://breakingjam.com/api/auth/login", {
    method: "POST",
    // A browser sets the length itself; `Request` here doesn't.
    headers: {
      "cf-connecting-ip": ip,
      "content-length": String(new TextEncoder().encode(body).length),
    },
    body,
  });
}

describe("Sign-in attempt limits", () => {
  it("counts only the routes that hash a password", () => {
    const at = (path: string, method: string) =>
      isAuthAttempt(new Request(`https://breakingjam.com${path}`, { method }));
    expect(at("/api/auth/login", "POST")).toBe(true);
    expect(at("/api/auth/register", "POST")).toBe(true);
    expect(at("/api/auth/password/reset", "POST")).toBe(true);
    // Their own limits in the API, and no hash: a room signing up must not run out.
    expect(at("/api/auth/email/verify", "POST")).toBe(false);
    expect(at("/api/auth/email/resend", "POST")).toBe(false);
    expect(at("/api/auth/logout", "POST")).toBe(false);
    expect(at("/api/auth/me", "GET")).toBe(false);
    expect(at("/api/events", "POST")).toBe(false);
  });

  it("gives every spelling the API matches to one account the same key", () => {
    const key = "lil.g@example.com";
    expect(emailOf({ email: "  Lil.G@Example.com " })).toBe(key);
    // Rust's trim strips U+0085 and U+00A0, which a plain JS trim leaves or handles apart.
    expect(emailOf({ email: "\u0085lil.g@example.com\u0085 " })).toBe(key);
    expect(emailOf({ email: "﻿lil.g@example.com​" })).toBe(key);
    // A dotted capital I lower-cases to "i" in Postgres.
    expect(emailOf({ email: "lİl.g@example.com" })).toBe(key);
    expect(emailOf({ email: 7 })).toBeNull();
    expect(emailOf({ email: " \u0085 " })).toBeNull();
    expect(emailOf(null)).toBeNull();
  });

  it("refuses an address over its limit, whatever email it names", async () => {
    const byIp = limiter(2);
    const byEmail = limiter(10);
    const attempt = (email: string) => refusal(login(email), byIp, byEmail);
    expect(await attempt("a@example.com")).toBeNull();
    expect(await attempt("b@example.com")).toBeNull();
    expect((await attempt("c@example.com"))?.status).toBe(429);
    // Refused by its address: the email's own tries are not used up.
    expect(byEmail.keys).toEqual(["a@example.com", "b@example.com"]);
  });

  it("refuses an email over its limit, from any address", async () => {
    const byIp = limiter(10);
    const byEmail = limiter(1);
    const attempt = (email: string, ip: string) =>
      refusal(login(email, ip), byIp, byEmail);
    expect(await attempt("a@example.com", "203.0.113.7")).toBeNull();
    const refused = await attempt("A@example.com\u0085", "203.0.113.8");
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get("retry-after")).toBe("60");
    expect(await refused?.json()).toEqual({
      error: {
        code: "too_many_requests",
        message: "too many attempts, try again in a minute",
      },
    });
    expect(await attempt("b@example.com", "203.0.113.8")).toBeNull();
  });

  it("leaves the body for the API", async () => {
    const request = login("a@example.com");
    expect(await refusal(request, limiter(1), limiter(1))).toBeNull();
    expect(await request.json()).toEqual({
      email: "a@example.com",
      password: "x",
    });
  });

  it("refuses a body too large to read, or of unknown size, before counting", async () => {
    const byIp = limiter(10);
    const large = new Request("https://breakingjam.com/api/auth/login", {
      method: "POST",
      headers: { "content-length": "5000000" },
      body: "{}",
    });
    const unsized = new Request("https://breakingjam.com/api/auth/login", {
      method: "POST",
      body: "{}",
    });
    for (const request of [large, unsized]) {
      const refused = await refusal(request, byIp, limiter(10));
      expect(refused?.status).toBe(413);
      expect(await refused?.json()).toEqual({
        error: { code: "payload_too_large", message: "request body too large" },
      });
    }
    expect(byIp.keys).toEqual([]);
  });
});
