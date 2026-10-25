import {
  clampView,
  cropRect,
  fileProblem,
  keyView,
  maxZoom,
  panBy,
  placement,
  type Rect,
  START,
  tooSmall,
} from "../../../src/features/jams/flyerCrop";

const LANDSCAPE = { width: 3000, height: 2000 };
const INSTAGRAM = { width: 1080, height: 1350 };

const file = (type: string, bytes = 10) =>
  new File([new Uint8Array(bytes)], "flyer", { type });

describe("the flyer crop", () => {
  it("takes PNG and JPEG files up to 20 MB", () => {
    expect(fileProblem(file("image/jpeg"))).toBeNull();
    expect(fileProblem(file("image/png"))).toBeNull();
    expect(fileProblem(file("image/gif"))).toBe("type");
    expect(fileProblem(file("image/heic"))).toBe("type");
    expect(fileProblem(file("image/png", 20 * 1024 * 1024 + 1))).toBe("size");
  });

  it("needs enough pixels for the card image", () => {
    expect(tooSmall({ width: 540, height: 675 })).toBe(false);
    expect(tooSmall({ width: 1080, height: 600 })).toBe(true);
  });

  it("starts on the largest 4:5 crop, centred", () => {
    expect(cropRect(LANDSCAPE, START)).toEqual({
      x: 700,
      y: 0,
      width: 1600,
      height: 2000,
    });
    // An Instagram portrait flyer already is 4:5: it fits as it is.
    expect(cropRect(INSTAGRAM, START)).toEqual({ x: 0, y: 0, ...INSTAGRAM });
  });

  it("zooms until the crop holds the card's 540 px, at most 4×", () => {
    expect(maxZoom(INSTAGRAM)).toBe(2);
    expect(maxZoom({ width: 6000, height: 8000 })).toBe(4);
    expect(maxZoom({ width: 540, height: 675 })).toBe(1);
    expect(clampView(INSTAGRAM, { zoom: 3, x: 0, y: 0 }).zoom).toBe(2);
    expect(clampView(INSTAGRAM, { zoom: 0.5, x: 0, y: 0 }).zoom).toBe(1);
  });

  it("keeps the crop inside the image", () => {
    expect(clampView(LANDSCAPE, { zoom: 1, x: 5000, y: 100 })).toEqual({
      zoom: 1,
      x: 700,
      y: 0,
    });
    const zoomed = clampView(INSTAGRAM, { zoom: 2, x: -1000, y: 1000 });
    expect(cropRect(INSTAGRAM, zoomed)).toEqual({
      x: 0,
      y: 675,
      width: 540,
      height: 675,
    });
  });

  it("drags the image with the pointer", () => {
    // 1600 image px under a 280 px frame: dragging right by 28 px shows 160 px further left.
    expect(panBy(LANDSCAPE, START, [28, 0])).toEqual({
      zoom: 1,
      x: -160,
      y: 0,
    });
    expect(keyView("ArrowLeft", LANDSCAPE, START)?.x).toBeGreaterThan(0);
    expect(keyView("+", INSTAGRAM, START)?.zoom).toBe(1.25);
    expect(keyView("Enter", INSTAGRAM, START)).toBeNull();
  });

  it("places the image so the crop fills the frame", () => {
    const close = (rect: Rect, expected: Rect) =>
      (Object.keys(expected) as (keyof Rect)[]).forEach((key) =>
        expect(rect[key]).toBeCloseTo(expected[key]),
      );
    // The landscape image overhangs the 280 × 350 frame on both sides.
    close(placement(LANDSCAPE, START, 280), {
      x: -122.5,
      y: 0,
      width: 525,
      height: 350,
    });
    close(placement(INSTAGRAM, START, 64), {
      x: 0,
      y: 0,
      width: 64,
      height: 80,
    });
  });
});
