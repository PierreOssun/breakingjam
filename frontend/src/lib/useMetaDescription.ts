import { useEffect } from "react";

/** Gives the page its own description while it is open, in `index.html`'s tag, not a second one. */
export function useMetaDescription(content: string) {
  useEffect(() => {
    const tag = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!tag) return;
    const site = tag.content;
    tag.content = content;
    return () => {
      tag.content = site;
    };
  }, [content]);
}
