import { useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Language } from "../../i18n";

type JamFlyerProps = {
  /** `updated_at` refreshes the flyer after an edit; lists without it keep it 5 minutes. */
  jam: { id: string; updated_at?: string };
  /** Date and art only, `aria-hidden`: for renders 120px wide or less (DESIGN.md §4.24). */
  compact?: boolean;
  /** Fetch only near the viewport: for long lists of thumbnails. */
  lazy?: boolean;
  className?: string;
};

/**
 * The generated 4:5 flyer, rendered by the API and inlined so it uses the page's fonts.
 * The SVG carries its own accessible name, "Generated flyer: <name>, <date>, <city>", in the
 * page language (DESIGN.md §4.24). Inlining is safe because the API escapes everything it
 * prints, quotes included (`backend/src/flyer.rs` tests). An uploaded flyer will take
 * precedence once it exists.
 */
export function JamFlyer({
  jam,
  compact = false,
  lazy = false,
  className = "",
}: JamFlyerProps) {
  const { i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, lazy);
  const lang = (i18n.resolvedLanguage ?? "en") as Language;
  const flyer = useQuery({
    // `updated_at` changes when the name, date or place does.
    queryKey: ["flyer", jam.id, jam.updated_at, lang, compact],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/events/{id}/flyer.svg", {
        params: { path: { id: jam.id }, query: { compact, lang } },
        parseAs: "text",
      });
      if (!response.ok || data === undefined)
        throw new Error(`flyer: ${response.status}`);
      return data;
    },
    staleTime: 5 * 60_000,
    enabled: near,
  });

  return (
    <div
      ref={ref}
      className={`aspect-[4/5] overflow-hidden bg-surface-raised ${className}`}
      dangerouslySetInnerHTML={flyer.data ? { __html: flyer.data } : undefined}
    />
  );
}

/** Whether the element is within 200px of the viewport; always true unless `lazy`. */
function useNearViewport(
  ref: RefObject<HTMLElement | null>,
  lazy: boolean,
): boolean {
  // Without IntersectionObserver (old browsers, jsdom) everything loads at once.
  const [near, setNear] = useState(
    !lazy || typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}
