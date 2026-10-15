// The API stores YouTube links as https://www.youtube.com/watch?v=<id> (§6 Video embeds).

/** The video id of a YouTube watch or youtu.be link, if it is one. */
export function youtubeId(link: string): string | null {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : host === "youtube.com"
          ? url.searchParams.get("v")
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
