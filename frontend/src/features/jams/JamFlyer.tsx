import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../../api/client";
import type { Language } from "../../i18n";
import { useNearViewport } from "../../lib/useNearViewport";

type JamFlyerProps = {
  /** `updated_at` refreshes the flyer after an edit; lists without it keep it 5 minutes.
   * Lists carry only the card-sized upload, the jam page both sizes. */
  jam: {
    id: string;
    name: string;
    updated_at?: string;
    flyer_url?: string | null;
    flyer_card_url?: string | null;
  };
  /** Date and art only, `aria-hidden`: for renders 120px wide or less (DESIGN.md §4.24). */
  compact?: boolean;
  /** Fetch only near the viewport: for long lists of thumbnails. */
  lazy?: boolean;
  className?: string;
};

/** A jam's 4:5 flyer: the one its organiser uploaded, else the generated one. */
export function JamFlyer(props: JamFlyerProps) {
  const { t } = useTranslation();
  const { jam, compact = false, lazy = false, className = "" } = props;
  const src = compact
    ? jam.flyer_card_url
    : (jam.flyer_url ?? jam.flyer_card_url);
  if (!src) return <GeneratedFlyer {...props} />;
  return (
    <div
      className={`aspect-[4/5] overflow-hidden bg-surface-raised ${className}`}
    >
      <img
        src={src}
        // Compact thumbnails sit next to the jam's name, like the generated ones.
        alt={compact ? "" : t("jam.flyerAlt", { name: jam.name })}
        loading={lazy ? "lazy" : undefined}
        className="size-full object-cover"
      />
    </div>
  );
}

/**
 * The generated flyer, rendered by the API and inlined so it uses the page's fonts.
 * The SVG carries its own accessible name, "Generated flyer: <name>, <date>, <city>", in the
 * page language (DESIGN.md §4.24). Inlining is safe because the API escapes everything it
 * prints, quotes included (`backend/src/flyer.rs` tests).
 */
function GeneratedFlyer({
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
    queryFn: async () =>
      unwrap(
        await api.GET("/api/events/{id}/flyer.svg", {
          params: { path: { id: jam.id }, query: { compact, lang } },
          parseAs: "text",
        }),
        "flyer",
      ),
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
