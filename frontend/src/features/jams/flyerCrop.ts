// The flyer upload (DESIGN.md §4.28): which files are taken, where the 4:5 crop sits in the
// image, and the two JPEGs the API stores. Pure but for `flyerImages`, so tested without a canvas.

export type Size = { width: number; height: number };
/** A rectangle in image pixels. */
export type Rect = Size & { x: number; y: number };
/** How the image sits under the frame: `zoom` 1 shows the largest 4:5 crop; `x`, `y` move the
 * crop's centre away from the image's, in image pixels. */
export type View = { zoom: number; x: number; y: number };

/** What the API accepts (backend `media.rs`): the jam page's flyer and its card version. */
export const FLYER = { width: 1080, height: 1350, maxBytes: 2 * 1024 * 1024 };
export const CARD = { width: 540, height: 675, maxBytes: 400 * 1024 };

export const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** A crop narrower than this is blown up so much that it looks soft on the jam page. */
export const SHARP_WIDTH = 900;
/** The crop frame on screen, the same on every viewport. */
export const FRAME = { width: 280, height: 350 };

export const START: View = { zoom: 1, x: 0, y: 0 };

/** Why a picked file can't be used before even opening it, if it can't. */
export function fileProblem(file: File): "type" | "size" | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_FILE_BYTES) return "size";
  return null;
}

/** Width of the largest 4:5 crop of `image`. */
function fullCropWidth(image: Size): number {
  return Math.min(image.width, (image.height * 4) / 5);
}

/** Whether the image is too small to fill even the card image. */
export function tooSmall(image: Size): boolean {
  return fullCropWidth(image) < CARD.width;
}

/** Zooming stops once the crop holds the card image's 540 px, or at 4×. */
export function maxZoom(image: Size): number {
  return Math.max(1, Math.min(4, fullCropWidth(image) / CARD.width));
}

/** `view` with its zoom in range and the crop kept inside the image. */
export function clampView(image: Size, view: View): View {
  const zoom = Math.min(Math.max(view.zoom, 1), maxZoom(image));
  const crop = cropRect(image, { zoom, x: 0, y: 0 });
  const clamp = (value: number, room: number) =>
    Math.min(Math.max(value, -room / 2), room / 2);
  return {
    zoom,
    x: clamp(view.x, image.width - crop.width),
    y: clamp(view.y, image.height - crop.height),
  };
}

/** The part of the image inside the frame. */
export function cropRect(image: Size, view: View): Rect {
  const width = fullCropWidth(image) / view.zoom;
  const height = (width * 5) / 4;
  return {
    x: image.width / 2 + view.x - width / 2,
    y: image.height / 2 + view.y - height / 2,
    width,
    height,
  };
}

/** `view` after the image is dragged by `dx`, `dy` screen pixels under a frame `frameWidth` wide. */
export function panBy(
  image: Size,
  view: View,
  [dx, dy]: [number, number],
  frameWidth = FRAME.width,
): View {
  const perPixel = cropRect(image, view).width / frameWidth;
  return clampView(image, {
    ...view,
    x: view.x - dx * perPixel,
    y: view.y - dy * perPixel,
  });
}

const KEY_MOVES: Record<string, [number, number]> = {
  ArrowLeft: [-16, 0],
  ArrowRight: [16, 0],
  ArrowUp: [0, -16],
  ArrowDown: [0, 16],
};

/** `view` after a key press on the crop area: arrows move the image, `+` and `-` zoom; null for
 * other keys. */
export function keyView(key: string, image: Size, view: View): View | null {
  const move = KEY_MOVES[key];
  if (move) return panBy(image, view, move);
  if (key === "+" || key === "=")
    return clampView(image, { ...view, zoom: view.zoom + 0.25 });
  if (key === "-") return clampView(image, { ...view, zoom: view.zoom - 0.25 });
  return null;
}

/** Where to draw the whole image, in CSS pixels from the top-left of a frame `frameWidth` wide. */
export function placement(image: Size, view: View, frameWidth: number): Rect {
  const crop = cropRect(image, view);
  const scale = frameWidth / crop.width;
  return {
    x: -crop.x * scale,
    y: -crop.y * scale,
    width: image.width * scale,
    height: image.height * scale,
  };
}

/** Draws the crop at `size` and encodes it, lowering the quality if it comes out too large. */
async function jpeg(
  image: CanvasImageSource,
  crop: Rect,
  size: typeof FLYER,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2D canvas");
  // A transparent PNG would turn black in a JPEG; the site's ink is the intended dark.
  context.fillStyle = "#0b0d14";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = "high";
  const { x, y, width, height } = crop;
  context.drawImage(image, x, y, width, height, 0, 0, size.width, size.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= size.maxBytes) return blob;
  }
  throw new Error("the flyer does not fit the size limit");
}

/** The two JPEGs of `POST /events/{id}/flyer`. Re-encoding leaves the photo's EXIF, GPS
 * included, behind. */
export async function flyerImages(image: CanvasImageSource, crop: Rect) {
  const [flyer, card] = await Promise.all([
    jpeg(image, crop, FLYER),
    jpeg(image, crop, CARD),
  ]);
  return { flyer, card };
}
