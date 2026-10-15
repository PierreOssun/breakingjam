import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { embedUrl, youtubeId } from "../lib/youtube";
import { Button } from "./Button";

export type Video = { url: string; offset?: number | null; name: string };

/** The official YouTube player in a modal (§6 Video embeds); nothing is downloaded or hosted. */
export function VideoDialog({
  video,
  onClose,
}: {
  video: Video | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const id = video ? youtubeId(video.url) : null;

  useEffect(() => {
    const dialog = ref.current;
    if (id && dialog && !dialog.open) dialog.showModal();
  }, [id]);

  if (!video || !id) return null;
  const title = t("video.title", { name: video.name });
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(92vw,960px)] max-w-none rounded-lg border border-border-strong bg-surface-raised p-4 text-text shadow-lg backdrop:bg-scrim lg:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-display text-display-sm">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("video.close")}
          onClick={() => ref.current?.close()}
        >
          <X size={20} weight="bold" aria-hidden />
        </Button>
      </div>
      <div className="aspect-video overflow-hidden rounded-md bg-bg">
        <iframe
          src={embedUrl(id, video.offset)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="size-full"
        />
      </div>
    </dialog>
  );
}
