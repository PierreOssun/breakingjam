// Open Graph tags for a jam page (ARCHITECTURE §9): the SPA can't give crawlers per-page
// <meta>, so the Worker adds them to index.html. Pure, so it is tested without a Worker.

/** The fields of `GET /api/events/{slug}` the tags use. */
export type JamSummary = {
  id: string;
  name: string;
  slug: string;
  city: string;
  starts_on: string;
  ends_on: string;
  /** The organiser's flyer at 540×675, null for the generated one. */
  flyer_card_url?: string | null;
};

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text safe inside an HTML attribute; jam names are user content. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

/** "Wed 4 Nov", or "Sat 8 – Sun 9 Nov": jam dates are calendar dates, read as UTC. */
export function jamDates(startsOn: string, endsOn: string): string {
  const format = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  return startsOn === endsOn
    ? format.format(day(startsOn))
    : format.formatRange(day(startsOn), day(endsOn));
}

/** "Paris Cypher · Sat 8 Jun · Paris": the title of shared links, as the page's Share writes it. */
export function shareTitle(jam: JamSummary): string {
  return `${jam.name} · ${jamDates(jam.starts_on, jam.ends_on)} · ${jam.city}`;
}

/** The tags to append to <head>: title with dates and city, the battles, and the uploaded
 * flyer, else the 1200×630 share image. */
export function openGraphTags(
  jam: JamSummary,
  battles: string[],
  origin: string,
): string {
  const slug = encodeURIComponent(jam.slug);
  const url = `${origin}/jams/${slug}`;
  const what = battles.length > 0 ? battles.join(" · ") : "A breaking jam";
  // The card size: small enough for every messenger's preview limit.
  const image: [string, string, string] = jam.flyer_card_url
    ? [jam.flyer_card_url, "540", "675"]
    : [`${origin}/api/events/${slug}/og.png`, "1200", "630"];
  const tags: [string, string][] = [
    ["og:type", "website"],
    ["og:site_name", "BreakingJam"],
    ["og:title", shareTitle(jam)],
    ["og:description", `${what} on BreakingJam`],
    ["og:url", url],
    ["og:image", image[0]],
    ["og:image:width", image[1]],
    ["og:image:height", image[2]],
    ["twitter:card", "summary_large_image"],
  ];
  const meta = tags.map(([key, content]) => {
    // Twitter reads `name`; Open Graph reads `property`.
    const attribute = key.startsWith("twitter:") ? "name" : "property";
    return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
  });
  return [...meta, `<link rel="canonical" href="${escapeHtml(url)}">`].join("");
}
