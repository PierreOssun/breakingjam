/** BreakingJam's own Instagram account: verification codes go to its DMs (§4 "Verify me"). */
export const BREAKINGJAM_INSTAGRAM = "breaking.jam";

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

/** A typed or pasted `@handle`, `handle` or profile URL as the bare handle (§4.20). */
export function toHandle(input: string): string {
  const value = input.trim();
  const fromUrl = value.match(/instagram\.com\/([^/?#\s]+)/i)?.[1];
  return (fromUrl ?? value).replace(/^@/, "");
}
