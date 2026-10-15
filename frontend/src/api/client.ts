import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

/** Where the API lives. Unset means same origin: Vite proxies `/api` in dev, the Worker does in prod (§9). */
// Absolute, because `Request` rejects relative URLs outside the browser (tests).
export const API_ORIGIN = (
  import.meta.env.VITE_API_URL || window.location.origin
).replace(/\/$/, "");

// Typed client for the BreakingJam API; paths and bodies come from `schema.d.ts`,
// generated from the backend's OpenAPI document (`npm run gen:api`).
export const api = createClient<paths>({
  baseUrl: API_ORIGIN,
  // `bj_session` must travel even when `VITE_API_URL` is another origin.
  credentials: "include",
  // Looked up per call, not captured at startup, so tests can stub `fetch`.
  fetch: (request) => globalThis.fetch(request),
});

export type Schemas = components["schemas"];
