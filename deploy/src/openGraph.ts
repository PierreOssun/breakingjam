// The head of a jam page for crawlers (ARCHITECTURE §9): the SPA can't give them per-page
// <meta>, so the Worker adds Open Graph tags, a description and Event structured data to
// index.html. Pure, so it is tested without a Worker.

/** The fields of `GET /api/events/{slug}` the head uses. */
export type JamSummary = {
  id: string;
  name: string;
  slug: string;
  city: string;
  starts_on: string;
  ends_on: string;
  status?: string;
  description?: string | null;
  venue_name?: string | null;
  address?: string | null;
  /** ISO 3166-1 alpha-2. */
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** The organiser's flyer at 1080×1350, null for the generated one. */
  flyer_url?: string | null;
  /** The same flyer at 540×675. */
  flyer_card_url?: string | null;
  /** Who runs it; null when the BreakingJam team entered it. */
  organizer?: { id: string; display_name: string } | null;
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

/** "1v1 Bboy · 2v2", or what a jam is when it has no battles yet. */
function battleLine(battles: string[]): string {
  return battles.length > 0 ? battles.join(" · ") : "A breaking jam";
}

/** The search snippet: when and where, then the battles, since the title has only the name. */
export function jamDescription(jam: JamSummary, battles: string[]): string {
  const dates = jamDates(jam.starts_on, jam.ends_on);
  return `${dates} in ${jam.city}. ${battleLine(battles)} on BreakingJam.`;
}

function jamUrl(jam: JamSummary, origin: string): string {
  return `${origin}/jams/${encodeURIComponent(jam.slug)}`;
}

/** The 1200×630 image rendered from the jam's generated flyer. */
function generatedImage(jam: JamSummary, origin: string): string {
  return `${origin}/api/events/${encodeURIComponent(jam.slug)}/og.png`;
}

/** The tags to append to <head>: title with dates and city, the battles, and the uploaded
 * flyer, else the 1200×630 share image. */
export function openGraphTags(
  jam: JamSummary,
  battles: string[],
  origin: string,
): string {
  const url = jamUrl(jam, origin);
  // The card size: small enough for every messenger's preview limit.
  const image: [string, string, string] = jam.flyer_card_url
    ? [jam.flyer_card_url, "540", "675"]
    : [generatedImage(jam, origin), "1200", "630"];
  const tags: [string, string][] = [
    ["og:type", "website"],
    ["og:site_name", "BreakingJam"],
    ["og:title", shareTitle(jam)],
    ["og:description", `${battleLine(battles)} on BreakingJam`],
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

/** schema.org Event data, which lets search engines show the jam as an event with its date
 * and place. Dates only: the times are wall-clock times that would need the zone's offset. */
export function eventJsonLd(jam: JamSummary, origin: string): string {
  const located = jam.lat != null && jam.lng != null;
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: jam.name,
    url: jamUrl(jam, origin),
    startDate: jam.starts_on,
    endDate: jam.ends_on,
    eventStatus: `https://schema.org/${jam.status === "cancelled" ? "EventCancelled" : "EventScheduled"}`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: jam.venue_name ?? jam.city,
      address: {
        "@type": "PostalAddress",
        streetAddress: jam.address ?? undefined,
        addressLocality: jam.city,
        addressCountry: jam.country ?? undefined,
      },
      geo: located
        ? { "@type": "GeoCoordinates", latitude: jam.lat, longitude: jam.lng }
        : undefined,
    },
    image: [jam.flyer_url ?? generatedImage(jam, origin)],
    description: jam.description ?? undefined,
    organizer: jam.organizer
      ? {
          "@type": "Organization",
          name: jam.organizer.display_name,
          url: `${origin}/organizers/${encodeURIComponent(jam.organizer.id)}`,
        }
      : undefined,
  };
  // "</script>" in a jam's text would end the tag early: "<" becomes its JSON escape.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}
