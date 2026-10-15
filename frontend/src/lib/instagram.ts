/** "@paris.cypher" for an Instagram profile link; the bare host for any other link. */
export function instagramLabel(link: string): string {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "");
    const handle = url.pathname.split("/").find(Boolean);
    return host === "instagram.com" && handle ? `@${handle}` : host;
  } catch {
    return link;
  }
}
