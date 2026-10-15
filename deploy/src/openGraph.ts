// Open Graph tags for a jam page (ARCHITECTURE §9): the SPA can't give crawlers per-page
// <meta>, so the Worker adds them to index.html. Pure, so it is tested without a Worker.

/** The fields of `GET /api/events/{slug}` the tags use. */
export type JamSummary = {
  name: string;
  slug: string;
  city: string;
  starts_on: string;
  ends_on: string;
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

/** "Sat 8 June 2030", or "Sat 8 – Sun 9 June 2030": jam dates are calendar dates, read as UTC. */
export function jamDates(startsOn: string, endsOn: string): string {
  const format = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  return startsOn === endsOn
    ? format.format(day(startsOn))
    : format.formatRange(day(startsOn), day(endsOn));
}

/** The tags to append to <head>: title, dates and city, the 1200×630 share image. */
export function openGraphTags(jam: JamSummary, origin: string): string {
  const slug = encodeURIComponent(jam.slug);
  const url = `${origin}/jams/${slug}`;
  const tags: [string, string][] = [
    ["og:type", "website"],
    ["og:site_name", "BreakingJam"],
    ["og:title", jam.name],
    ["og:description", `${jamDates(jam.starts_on, jam.ends_on)} · ${jam.city}`],
    ["og:url", url],
    ["og:image", `${origin}/api/events/${slug}/og.png`],
    ["og:image:width", "1200"],
    ["og:image:height", "630"],
    ["twitter:card", "summary_large_image"],
  ];
  const meta = tags.map(([key, content]) => {
    // Twitter reads `name`; Open Graph reads `property`.
    const attribute = key.startsWith("twitter:") ? "name" : "property";
    return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
  });
  return [...meta, `<link rel="canonical" href="${escapeHtml(url)}">`].join("");
}
