import { Play } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

// DESIGN.md §4.3: over a photo, so the same dark glass in both themes.
const glass = "rounded-full bg-[#0B0D14]/72 text-on-primary backdrop-blur";

/**
 * "Videos available" on a jam preview whose battles have videos (DESIGN.md §4.3): over a card's
 * flyer, as a ▶ badge on a thumbnail, as "▶ Videos" at the end of a list row, or as an outlined
 * "▶ Videos available" on a landing result card (§4.43). Never a link
 * of its own: the preview it sits in opens the jam's battles.
 */
export function VideosChip({
  on,
}: {
  on: "flyer" | "thumbnail" | "row" | "card";
}) {
  const { t } = useTranslation();
  const label = t("jam.videosAvailable");
  if (on === "thumbnail") {
    return (
      <span
        className={`absolute bottom-1.5 left-1.5 grid size-6 place-items-center ${glass}`}
      >
        <Play size={12} weight="fill" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (on === "card") {
    return (
      <span className="inline-flex h-[26px] items-center gap-1.5 self-start rounded-full border border-border px-2.5 text-[12px] font-extrabold">
        <Play
          size={12}
          weight="fill"
          className="text-primary-text"
          aria-hidden
        />
        {label}
      </span>
    );
  }
  if (on === "row") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[12px] font-extrabold">
        <Play
          size={12}
          weight="fill"
          className="text-primary-text"
          aria-hidden
        />
        <span aria-hidden>{t("jam.videos")}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span
      className={`absolute bottom-3 left-3 inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-extrabold ${glass}`}
    >
      <Play size={12} weight="fill" aria-hidden />
      {label}
    </span>
  );
}
