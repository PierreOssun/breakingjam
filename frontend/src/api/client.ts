import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

// Typed client for the BreakingJam API; paths and bodies come from `schema.d.ts`,
// generated from the backend's OpenAPI document (`npm run gen:api`).
export const api = createClient<paths>({
  // Empty means same origin: Vite proxies `/api` in dev, the Worker does in prod (§9).
  baseUrl: import.meta.env.VITE_API_URL ?? "",
  // `bj_session` must travel even when `VITE_API_URL` is another origin.
  credentials: "include",
});

export type Schemas = components["schemas"];
