import { Play } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** "▶ Video" beside a battle result (DESIGN.md §4.37); opens the video player. */
export function VideoPill({
  name,
  onClick,
}: {
  /** What the video shows, for its accessible name "Watch <name>". */
  name: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t("jam.watch", { name })}
      onClick={onClick}
      // 32px tall, grown to a 44px target by `after:`; `z-[1]` lifts it over stretched row links.
      className="relative z-[1] inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-bold transition-colors duration-fast after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:border-border-strong"
    >
      <Play size={14} weight="fill" className="text-primary-text" aria-hidden />
      {t("jam.video")}
    </button>
  );
}
