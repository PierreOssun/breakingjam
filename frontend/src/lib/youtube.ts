// The API stores YouTube links as https://www.youtube.com/watch?v=<id> (§6 Video embeds).

/** The video id of a YouTube watch, live or youtu.be link, if it is one: the API's rule. */
export function youtubeId(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^(www|m)\./, "");
    const [first, second] = url.pathname.slice(1).split("/");
    const id =
      host === "youtu.be"
        ? first
        : host === "youtube.com" && first === "watch"
          ? url.searchParams.get("v")
          : host === "youtube.com" && first === "live"
            ? second
            : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The privacy-enhanced embed URL, starting at `offset` seconds when given. */
export function embedUrl(id: string, offset?: number | null): string {
  const start = offset ? `&start=${offset}` : "";
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0${start}`;
}
