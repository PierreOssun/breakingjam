import { ArrowCounterClockwise, Minus, Plus } from "@phosphor-icons/react";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { IconButton } from "../../components/IconButton";
import { InlineNotice } from "../../components/InlineNotice";
import { formatShortDateRange } from "../../lib/dates";
import {
  clampView,
  cropRect,
  FRAME,
  keyView,
  maxZoom,
  panBy,
  placement,
  type Rect,
  SHARP_WIDTH,
  type Size,
  START,
  type View,
} from "./flyerCrop";

type FlyerCropDialogProps = {
  /** The picked image, decoded; the caller owns its object URL. */
  image: HTMLImageElement;
  /** What the list preview shows next to the flyer. */
  jam: { name: string; city: string; starts_on: string; ends_on: string };
  saving: boolean;
  onCrop: (crop: Rect) => void;
  onClose: () => void;
};

/** Crop a picked image to the flyer's 4:5 before it is uploaded (DESIGN.md §4.28). */
export function FlyerCropDialog({
  image,
  jam,
  saving,
  onCrop,
  onClose,
}: FlyerCropDialogProps) {
  const { t } = useTranslation();
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  const [view, setView] = useState<View>(START);
  const zoomBy = (step: number) =>
    setView((v) => clampView(size, { ...v, zoom: v.zoom + step }));
  const crop = cropRect(size, view);
  const top = maxZoom(size);
  return (
    <Dialog
      title={t("org.flyer.crop.title")}
      size="form"
      onClose={onClose}
      action={{
        label: t("org.flyer.crop.use"),
        loading: saving,
        onClick: () => onCrop(crop),
      }}
    >
      <CropArea image={image} size={size} view={view} onView={setView} />
      <div className="-mt-3 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <IconButton
            label={t("org.flyer.crop.zoomOut")}
            onClick={() => zoomBy(-0.25)}
            disabled={view.zoom <= 1}
          >
            <Minus size={20} weight="bold" aria-hidden />
          </IconButton>
          <input
            type="range"
            aria-label={t("org.flyer.crop.zoom")}
            min={1}
            max={top}
            step={0.01}
            value={view.zoom}
            onChange={(e) =>
              setView((v) =>
                clampView(size, { ...v, zoom: Number(e.target.value) }),
              )
            }
            className="h-11 min-w-0 flex-1 cursor-pointer accent-primary"
          />
          <IconButton
            label={t("org.flyer.crop.zoomIn")}
            onClick={() => zoomBy(0.25)}
            disabled={view.zoom >= top}
          >
            <Plus size={20} weight="bold" aria-hidden />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={() => setView(START)}>
            <ArrowCounterClockwise size={16} weight="bold" aria-hidden />
            {t("org.flyer.crop.reset")}
          </Button>
        </div>
        <p className="text-caption text-muted">{t("org.flyer.crop.hint")}</p>
      </div>
      {crop.width < SHARP_WIDTH && (
        <InlineNotice actionable>
          {t("org.flyer.crop.soft", { width: Math.round(crop.width) })}
        </InlineNotice>
      )}
      <Previews image={image} size={size} view={view} jam={jam} />
    </Dialog>
  );
}

type CropProps = { image: HTMLImageElement; size: Size; view: View };

/** The image under the 4:5 frame: drag or pinch it, or use the keys. */
function CropArea({
  image,
  size,
  view,
  onView,
}: CropProps & { onView: (view: View) => void }) {
  const { t } = useTranslation();
  const gesture = useCropGesture(size, view, onView);
  return (
    // Full-bleed in the sheet; a block button doesn't stretch, so this wrapper does.
    <div className="-mx-4 lg:mx-0">
      <button
        type="button"
        aria-label={t("org.flyer.crop.area")}
        {...gesture}
        className="relative block h-[382px] w-full cursor-grab touch-none overflow-hidden bg-bg active:cursor-grabbing lg:rounded-md"
      >
        <span
          className="absolute top-1/2 left-1/2 block -translate-x-1/2 -translate-y-1/2"
          style={{ width: FRAME.width, height: FRAME.height }}
        >
          <Placed image={image} size={size} view={view} width={FRAME.width} />
          <span
            aria-hidden
            className="absolute inset-0 border-2 border-text shadow-[0_0_0_9999px_var(--color-scrim)]"
          />
        </span>
      </button>
    </div>
  );
}

/** The whole image, placed so that the crop fills a frame `width` wide at its top-left. */
function Placed({ image, size, view, width }: CropProps & { width: number }) {
  const at = placement(size, view, width);
  return (
    <img
      src={image.src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none select-none"
      style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
    />
  );
}

type Point = [number, number];

const middle = (points: Point[]): Point => [
  points.reduce((sum, [x]) => sum + x, 0) / points.length,
  points.reduce((sum, [, y]) => sum + y, 0) / points.length,
];
const spread = ([a, b]: Point[]) =>
  a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 : 1;

/** Drag with one pointer, pinch with two, or press keys; each gesture starts from `view`. */
function useCropGesture(size: Size, view: View, onView: (view: View) => void) {
  const pointers = useRef(new Map<number, Point>());
  const start = useRef<{ view: View; points: Point[] } | null>(null);
  const rebase = () => {
    start.current = { view, points: [...pointers.current.values()] };
  };
  const lift = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) rebase();
    else start.current = null;
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      rebase();
    },
    onPointerMove: (e: PointerEvent) => {
      const from = start.current;
      if (!from || !pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      const now = [...pointers.current.values()];
      if (now.length !== from.points.length) {
        rebase();
        return;
      }
      const zoom = (from.view.zoom * spread(now)) / spread(from.points);
      const [[x1, y1], [x0, y0]] = [middle(now), middle(from.points)];
      const zoomed = clampView(size, { ...from.view, zoom });
      onView(panBy(size, zoomed, [x1 - x0, y1 - y0]));
    },
    onPointerUp: lift,
    onPointerCancel: lift,
    onKeyDown: (e: KeyboardEvent) => {
      const next = keyView(e.key, size, view);
      if (!next) return;
      e.preventDefault();
      onView(next);
    },
  };
}

/** The crop at card and list size, the list row with the jam's date, name and city. */
function Previews({
  image,
  size,
  view,
  jam,
}: CropProps & { jam: FlyerCropDialogProps["jam"] }) {
  const { t, i18n } = useTranslation();
  const thumb = (width: number, className: string) => (
    <span
      aria-hidden
      className={`relative block shrink-0 overflow-hidden bg-bg ${className}`}
      style={{ width, height: (width * 5) / 4 }}
    >
      <Placed image={image} size={size} view={view} width={width} />
    </span>
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-text uppercase">
        {t("org.flyer.crop.previews")}
      </p>
      <div className="flex items-start gap-4">
        {thumb(96, "rounded-md border border-border")}
        <div className="flex min-w-0 flex-1 gap-3 rounded-lg border border-border bg-surface p-3">
          {thumb(64, "rounded-md")}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-label text-primary-text uppercase">
              {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
            </p>
            <p className="line-clamp-2 font-display text-display-xs break-words">
              {jam.name}
            </p>
            <p className="truncate text-body-sm text-muted">{jam.city}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
