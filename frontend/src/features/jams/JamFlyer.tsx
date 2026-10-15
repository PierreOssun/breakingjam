import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Language } from "../../i18n";

type JamFlyerProps = {
  jam: { id: string; updated_at: string };
  /** Date and art only, `aria-hidden`: for renders 120px wide or less (DESIGN.md §4.24). */
  compact?: boolean;
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
  className = "",
}: JamFlyerProps) {
  const { i18n } = useTranslation();
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
  });

  return (
    <div
      className={`aspect-[4/5] overflow-hidden bg-surface-raised ${className}`}
      dangerouslySetInnerHTML={flyer.data ? { __html: flyer.data } : undefined}
    />
  );
}
