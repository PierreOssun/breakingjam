// The production edge (ARCHITECTURE §9): one Worker serves the built frontend as static
// assets, forwards /api/* to the Rust API running as a Cloudflare Container, gives jam
// pages their Open Graph tags and stores the images the API uploads.
import { Container, ContainerProxy } from "@cloudflare/containers";
import { MEDIA_STORE_HOST, storeMedia } from "./media";
import { type JamSummary, openGraphTags } from "./openGraph";

/** Bindings and vars from wrangler.jsonc, and the secrets set with `wrangler secret put`. */
export interface Env {
  API: DurableObjectNamespace<Api>;
  ASSETS: Fetcher;
  /** Uploaded images (flyers), served by the bucket's own domain. */
  MEDIA: R2Bucket;
  /** `https://breakingjam.com`: the one public origin. */
  APP_BASE_URL: string;
  GOOGLE_REDIRECT_URL: string;
  RUST_LOG: string;
  /** How many API containers share the traffic. */
  API_INSTANCES: string;
  /** `https://media.breakingjam.com`: where uploaded images are read from. */
  MEDIA_PUBLIC_URL: string;
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
      MEDIA_STORE_URL: `http://${MEDIA_STORE_HOST}`,
      MEDIA_PUBLIC_URL: env.MEDIA_PUBLIC_URL,
    };
  }
}

// Assigned, not a `static` field: the library's setter registers the handler, and a class
// field would bypass it. The API's media writes land here instead of on the network.
Api.outboundByHost = {
  [MEDIA_STORE_HOST]: (request: Request, env: Env) =>
    storeMedia(request, env.MEDIA),
};

// The entrypoint the container's outbound requests go through, for the handler above.
export { ContainerProxy };

/** One of the API instances, next to the database; they hold no state, sessions live in Postgres. */
function api(env: Env) {
  const n = Math.floor(Math.random() * (Number(env.API_INSTANCES) || 1));
  // An instance's Durable Object stays where it is first created. Without a hint that was near
  // the first caller, the deploy's check from a US runner, and its container followed, so every
  // query crossed the Atlantic to Neon in Frankfurt; the old `instance-N` names stay pinned
  // there. The hint is best effort: wrangler.jsonc also limits the containers to WEUR.
  const id = env.API.idFromName(`weur-${n}`);
  return env.API.get(id, { locationHint: "weur" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.TEST_SITE !== "true") return route(request, env);
    if (new URL(request.url).pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain", "x-robots-tag": NO_INDEX },
      });
    }
    return asTestSite(await route(request, env));
  },
} satisfies ExportedHandler<Env>;

const NO_INDEX = "noindex, nofollow";

// The app shows its test-site banner when a page has this (frontend TestSiteBanner). The same
// on every page, so pages stay cacheable; the closed state lives in the browser.
const TEST_SITE_MARKER = '<meta name="test-site" content="true">';

/** The response marked noindex, and its pages marked for the app's test-site banner. */
function asTestSite(response: Response) {
  const marked = new Response(response.body, response);
  marked.headers.set("x-robots-tag", NO_INDEX);
  if (!marked.headers.get("content-type")?.includes("text/html")) return marked;
  return new HTMLRewriter()
    .on("head", {
      element: (head) => {
        head.append(TEST_SITE_MARKER, { html: true });
      },
    })
    .transform(marked);
}

/** The API, a jam page with its Open Graph tags, or a file of the built site. */
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return api(env).fetch(withCountry(request));
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
  const battles = await publicBattles(request, env, jam.id);
  const origin = new URL(env.APP_BASE_URL).origin;
  return new HTMLRewriter()
    .on("title", {
      element: (title) => {
        title.setInnerContent(`${jam.name} · BreakingJam`);
      },
    })
    .on("head", {
      element: (head) => {
        head.append(openGraphTags(jam, battles, origin), { html: true });
      },
    })
    .transform(page);
}

/** The jam's battle names in display order; none when the API can't say. */
async function publicBattles(
  request: Request,
  env: Env,
  id: string,
): Promise<string[]> {
  try {
    const path = `/api/events/${encodeURIComponent(id)}/battles`;
    const response = await api(env).fetch(
      new Request(new URL(path, request.url)),
    );
    if (!response.ok) return [];
    return ((await response.json()) as { name: string }[]).map((b) => b.name);
  } catch {
    return [];
  }
}

/** The jam as an anonymous visitor sees it: null for drafts, unknown slugs or an API error. */
async function publicJam(
  request: Request,
  env: Env,
  slug: string,
): Promise<JamSummary | null> {
  try {
    const path = `/api/events/${slug}`;
    const response = await api(env).fetch(
      new Request(new URL(path, request.url)),
    );
    return response.ok ? ((await response.json()) as JamSummary) : null;
  } catch {
    return null;
  }
}
