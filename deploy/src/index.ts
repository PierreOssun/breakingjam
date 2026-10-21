// The production edge (ARCHITECTURE §9): one Worker serves the built frontend as static
// assets, forwards /api/* to the Rust API running as a Cloudflare Container, and gives jam
// pages their Open Graph tags.
import { Container, getRandom } from "@cloudflare/containers";
import { type JamSummary, openGraphTags } from "./openGraph";
import {
  bannerClosed,
  CLOSE_PATH,
  closeBanner,
  TEST_BANNER,
  withoutRevalidation,
} from "./testSite";

/** Bindings and vars from wrangler.jsonc, and the secrets set with `wrangler secret put`. */
export interface Env {
  API: DurableObjectNamespace<Api>;
  ASSETS: Fetcher;
  /** `https://breakingjam.com`: the one public origin. */
  APP_BASE_URL: string;
  GOOGLE_REDIRECT_URL: string;
  RUST_LOG: string;
  /** How many API containers share the traffic. */
  API_INSTANCES: string;
  DATABASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** "true" on UAT only: kept out of search engines, with a banner saying its jams are demo data. */
  TEST_SITE?: string;
}

/** The API: `backend/Dockerfile`, configured from the Worker's vars and secrets. */
export class Api extends Container<Env> {
  defaultPort = 8080;
  // An idle instance stops after this; the next request starts it again in 1–3 s.
  sleepAfter = "30m";
  // Ready once this answers; the library only checks that the port is up, not the status.
  pingEndpoint = "localhost/api/health";

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      DATABASE_URL: env.DATABASE_URL,
      APP_BASE_URL: env.APP_BASE_URL,
      // Where the API sends the browser after Google sign-in: the site, same origin.
      FRONTEND_ORIGIN: env.APP_BASE_URL,
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URL: env.GOOGLE_REDIRECT_URL,
      RUST_LOG: env.RUST_LOG,
      LOG_FORMAT: "json",
    };
  }
}

/** One of the API instances; they hold no state, sessions live in Postgres. */
function api(env: Env) {
  return getRandom(env.API, Number(env.API_INSTANCES) || 1);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.TEST_SITE !== "true") return route(request, env);
    const { pathname } = new URL(request.url);
    if (pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain", "x-robots-tag": NO_INDEX },
      });
    }
    if (pathname === CLOSE_PATH) return closeBanner(request);
    const page = await route(withoutRevalidation(request), env);
    return asTestSite(page, !bannerClosed(request));
  },
} satisfies ExportedHandler<Env>;

const NO_INDEX = "noindex, nofollow";

/** The response marked noindex, and its pages given the test-site banner unless it was closed. */
function asTestSite(response: Response, banner: boolean) {
  const marked = new Response(response.body, response);
  marked.headers.set("x-robots-tag", NO_INDEX);
  if (!marked.headers.get("content-type")?.includes("text/html")) return marked;
  // Pages differ by the banner cookie: no validator to revalidate with, nothing to cache.
  marked.headers.delete("etag");
  marked.headers.delete("last-modified");
  marked.headers.set("cache-control", "no-store");
  if (!banner) return marked;
  return new HTMLRewriter()
    .on("body", {
      element: (body) => {
        body.prepend(TEST_BANNER, { html: true });
      },
    })
    .transform(marked);
}

/** The API, a jam page with its Open Graph tags, or a file of the built site. */
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return (await api(env)).fetch(withCountry(request));
  }
  // The segment stays as the browser encoded it: decoding could throw on a malformed one.
  const jam = /^\/jams\/([^/]+)\/?$/.exec(url.pathname);
  if (jam?.[1]) return jamPage(request, env, jam[1]);
  return env.ASSETS.fetch(request);
}

/** The request with the visitor's country (`GET /api/geo`), replacing any the client sent. */
function withCountry(request: Request) {
  const forwarded = new Request(request);
  const country = request.cf?.country;
  if (typeof country === "string")
    forwarded.headers.set("cf-ipcountry", country);
  else forwarded.headers.delete("cf-ipcountry");
  return forwarded;
}

/** index.html with the jam's Open Graph tags; the plain page when the jam can't be read. */
async function jamPage(request: Request, env: Env, slug: string) {
  const [page, jam] = await Promise.all([
    // The SPA fallback answers any path with index.html.
    env.ASSETS.fetch(request),
    publicJam(request, env, slug),
  ]);
  if (!jam || !page.headers.get("content-type")?.includes("text/html")) {
    return page;
  }
  const origin = new URL(env.APP_BASE_URL).origin;
  return new HTMLRewriter()
    .on("title", {
      element: (title) => {
        title.setInnerContent(`${jam.name} · BreakingJam`);
      },
    })
    .on("head", {
      element: (head) => {
        head.append(openGraphTags(jam, origin), { html: true });
      },
    })
    .transform(page);
}

/** The jam as an anonymous visitor sees it: null for drafts, unknown slugs or an API error. */
async function publicJam(
  request: Request,
  env: Env,
  slug: string,
): Promise<JamSummary | null> {
  try {
    const path = `/api/events/${slug}`;
    const response = await (
      await api(env)
    ).fetch(new Request(new URL(path, request.url)));
    return response.ok ? ((await response.json()) as JamSummary) : null;
  } catch {
    return null;
  }
}
