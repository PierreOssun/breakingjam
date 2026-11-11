// The pixel avatar's spec and its renderer (DESIGN.md §4.16), ported pixel for pixel from
// `milestones/avatar-rework/avatar-generator.py`; `tests/features/dancers/avatar.test.ts` holds
// it to that file's golden grids. Pure: `PixelAvatar.tsx` turns the result into SVG.

/** Every slot's values, the first being its default (hair styles and colours in builder order). */
export const AVATAR_OPTIONS = {
  skin: ["light", "tan", "medium", "deep"],
  style: [
    "spiky",
    "flame",
    "sweep",
    "buzz",
    "mohawk",
    "flattop",
    "afro",
    "locs",
    "bun",
    "long",
    "bangs",
    "bob",
    "pony",
    "highpony",
    "twintails",
    "braids",
    "puffs",
    "space",
  ],
  hair: ["black", "brown", "bleach", "red", "pink", "blue", "violet"],
  head: ["none", "headband", "bandana", "bucket", "hood", "cap", "beanie"],
  accent: ["white", "red", "blue", "violet", "black"],
  brows: ["set", "fierce"],
  mouth: ["smirk", "grin"],
  face: ["none", "shades", "plaster", "scar", "mask", "paint"],
  outfit: ["hoodie", "track", "tank", "jersey", "bomber"],
  cloth: ["ink", "white", "blue", "violet", "red"],
  extra: ["none", "phones", "chain"],
  bg: ["klein", "violet", "ink", "night", "crimson", "white"],
  fx: ["rings", "burst", "halftone", "aura", "city"],
} as const;

type Options = typeof AVATAR_OPTIONS;

/** An avatar: one value per slot, and the three details that are on or off. */
export type AvatarSpec = { [K in keyof Options]: Options[K][number] } & {
  lashes: boolean;
  lips: boolean;
  hoops: boolean;
};

/** A spec with every slot at its default, then `over`. */
export function avatarSpec(over: Partial<AvatarSpec> = {}): AvatarSpec {
  const defaults = Object.fromEntries(
    Object.entries(AVATAR_OPTIONS).map(([slot, values]) => [slot, values[0]]),
  ) as Pick<AvatarSpec, keyof Options>;
  return { ...defaults, lashes: false, lips: false, hoops: false, ...over };
}

/** A stage effect's pixel, drawn under the sprite: `rim` ones at 55% opacity. */
export type FxPixel = [x: number, y: number, kind: "ring" | "rim"];

/** What the SVG draws: the stage, its effect, then the sprite (null shows the stage). */
export type AvatarRender = {
  background: string;
  ring: string;
  rim: string;
  fx: FxPixel[];
  sprite: (string | null)[][];
};

type Shades = readonly [string, string, string];

const OUTLINE = "#0B0D14";
/** Base, shade, feature. */
const SKINS: Record<AvatarSpec["skin"], Shades> = {
  light: ["#F2C7A2", "#D9A07C", "#A0604A"],
  tan: ["#E3AE84", "#C48A60", "#8A4A32"],
  medium: ["#C68A5C", "#A26B42", "#6E3A22"],
  deep: ["#8A5638", "#6A3E26", "#3C2015"],
};
/** Base, shade, light. */
const HAIRS: Record<AvatarSpec["hair"], Shades> = {
  black: ["#23253A", "#14151F", "#4A5175"],
  brown: ["#5A3626", "#3A2117", "#86563C"],
  bleach: ["#E6DFCF", "#B9AE98", "#FFFFFF"],
  violet: ["#5B3BD6", "#3A239E", "#9277FF"],
  blue: ["#2448D0", "#152E96", "#6E8EFF"],
  red: ["#C2354A", "#8A1F30", "#F27A88"],
  pink: ["#E86AA6", "#B8437C", "#FFB3D6"],
};
/** Base, shade, detail. */
const CLOTHS: Record<AvatarSpec["cloth"], Shades> = {
  ink: ["#232A40", "#151A2A", "#39425F"],
  blue: ["#2F5BFF", "#1C3FD0", "#7D99FF"],
  violet: ["#6D3AF5", "#4E22C9", "#A387FF"],
  white: ["#E8EBF3", "#B9C0D2", "#FFFFFF"],
  red: ["#D8354A", "#A3202F", "#FF6A7B"],
};
/** Base, shade, light: headgear, mask, face paint, trims, hair ties and beads. */
const ACCENTS: Record<AvatarSpec["accent"], Shades> = {
  white: ["#F3F5FA", "#B9C0D2", "#FFFFFF"],
  red: ["#E0394E", "#A82436", "#FF8A98"],
  blue: ["#2F5BFF", "#1C3FD0", "#9DB3FF"],
  violet: ["#7A4BFF", "#5226D6", "#C3AEFF"],
  black: ["#262C44", "#141829", "#515B80"],
};
/** Stage, ring, rim light. */
const STAGES: Record<AvatarSpec["bg"], Shades> = {
  klein: ["#2F5BFF", "#4A72FF", "#C7D4FF"],
  violet: ["#6D3AF5", "#8257FF", "#DCCFFF"],
  ink: ["#1C2133", "#2A3150", "#9FB4FF"],
  night: ["#0F1530", "#1D2A5C", "#8FAAFF"],
  crimson: ["#B3243B", "#D43F55", "#FFC2CB"],
  white: ["#E6EAF5", "#CBD3E6", "#FFFFFF"],
};

// The sprite is drawn in palette keys, resolved to colours at the end, as parts read each other
// ("is this pixel skin?"). S s o: skin base, shade, feature · H k l: hair base, shade, light ·
// C c d: cloth base, shade, detail · A a B: accent base, shade, light · O: ink · W: white ·
// E: eye · r: cheek · P Q: glass · G g: silver · L: lip · R: rim light.
type Key = string;
type Grid = (Key | null)[][];
type Point = readonly [number, number];

/** Points from a flat `x, y, x, y…` list, which reads (and wraps) as rows of numbers. */
const pts = (xy: readonly number[]): Point[] =>
  Array.from({ length: xy.length / 2 }, (_, i) => [xy[2 * i]!, xy[2 * i + 1]!]);

const SIZE = 32;
const blank = (): Grid =>
  Array.from({ length: SIZE }, () => Array<Key | null>(SIZE).fill(null));
const at = (g: Grid, x: number, y: number) => g[y]?.[x] ?? null;
const is = (g: Grid, x: number, y: number, keys: string) => {
  const key = at(g, x, y);
  return key !== null && keys.includes(key);
};
function put(g: Grid, x: number, y: number, key: Key | null) {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) g[y]![x] = key;
}
/** `a..b`, both included. */
const span = (a: number, b: number) =>
  Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const dots = (g: Grid, points: readonly Point[], key: Key) =>
  points.forEach(([x, y]) => put(g, x, y, key));
/** `key` on every x of every y. */
function block(
  g: Grid,
  ys: readonly number[],
  xs: readonly number[],
  key: Key | ((x: number, y: number) => Key),
) {
  for (const y of ys)
    for (const x of xs) put(g, x, y, typeof key === "string" ? key : key(x, y));
}

type Ellipse = readonly [cx: number, cy: number, rx: number, ry: number];
/** Whether the pixel's centre is inside the ellipse. */
function inside([cx, cy, rx, ry]: Ellipse, x: number, y: number) {
  const dx = (x + 0.5 - cx) / rx;
  const dy = (y + 0.5 - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
/** `key` on the ellipse's pixels of rows `y0..y1`. */
function oval(g: Grid, e: Ellipse, y0: number, y1: number, key: Key) {
  for (const y of span(y0, y1))
    for (const x of span(0, SIZE - 1)) if (inside(e, x, y)) g[y]![x] = key;
}
/** A triangle from its tip to the base `x0..x1` on row `by`. */
function tri(
  g: Grid,
  tip: Point,
  x0: number,
  x1: number,
  by: number,
  key: Key,
) {
  const [tx, ty] = tip;
  for (const y of span(Math.min(ty, by), Math.max(ty, by))) {
    const t = by === ty ? 1 : (y - ty) / (by - ty);
    const left = Math.floor(tx + (x0 - tx) * t + 0.5);
    const right = Math.floor(tx + (x1 - tx) * t + 0.5);
    for (const x of span(left, right)) put(g, x, y, key);
  }
}

const HEAD: Ellipse = [15.5, 13.6, 6.6, 7.6];
const ALL = span(0, SIZE - 1);

/** The hoodie's silhouette, which every outfit is cut from. */
function drawTorso(g: Grid) {
  const rows: Record<number, Point> = {
    22: [10, 21],
    23: [8, 23],
    24: [6, 25],
    25: [4, 27],
    26: [3, 28],
  };
  for (const y of span(22, 31)) {
    const [x0, x1] = rows[y] ?? [2, 29];
    block(g, [y], span(x0, x1), torsoShade);
  }
  block(g, [23], span(12, 19), "c");
  block(g, span(25, 29), [13, 18], "d");
}
const torsoShade = (x: number, y: number) =>
  x >= 23 ? "c" : x <= 6 && y >= 26 ? "d" : "C";

function drawOutfit(g: Grid, outfit: AvatarSpec["outfit"]) {
  if (outfit === "hoodie") return;
  const torso = span(22, 31).flatMap((y) =>
    ALL.filter((x) => is(g, x, y, "Ccd")).map((x): Point => [x, y]),
  );
  const top: Record<number, number> = {};
  for (const [x, y] of torso) top[x] = Math.min(top[x] ?? 99, y);
  // The hoodie's collar and strings go: each outfit draws its own.
  for (const [x, y] of torso) g[y]![x] = torsoShade(x, y);
  OUTFITS[outfit](g, torso, top);
}

type Outfit = (g: Grid, torso: Point[], top: Record<number, number>) => void;
const OUTFITS: Record<Exclude<AvatarSpec["outfit"], "hoodie">, Outfit> = {
  track(g, _, top) {
    for (const x of span(3, 10))
      dots(
        g,
        [
          [x, top[x]! + 1],
          [x, top[x]! + 3],
        ],
        "A",
      );
    for (const x of span(21, 28))
      dots(
        g,
        [
          [x, top[x]! + 1],
          [x, top[x]! + 3],
        ],
        "a",
      );
    block(g, span(21, 23), [11, 12, 19, 20], (x) => (x < 16 ? "C" : "c"));
    block(g, span(23, 31), [15], "A");
    block(g, span(23, 31), [16], "d");
    put(g, 15, 24, "B");
  },
  tank(g, torso) {
    const rows: Record<number, Point | null> = {
      22: null,
      23: [10, 21],
      24: [7, 24],
      25: [6, 25],
      26: [5, 26],
    };
    for (const [x, y] of torso) {
      const row = y in rows ? rows[y]! : ([4, 27] as const);
      if (!row || x < row[0] || x > row[1]) g[y]![x] = null;
      else if (
        (x >= 11 && x <= 20 && y >= 25) ||
        ([11, 12, 19, 20].includes(x) && y >= 23)
      )
        g[y]![x] = x >= 18 ? "c" : "C";
      else g[y]![x] = x >= 21 ? "s" : "S";
    }
    block(g, span(27, 31), [9, 22], "o");
    block(g, [25], span(13, 18), (x) => (x < 17 ? "S" : "s"));
    block(g, [26], span(14, 17), (x) => (x < 17 ? "S" : "s"));
    dots(g, pts([6, 26, 5, 27, 25, 26, 26, 27]), "o");
  },
  jersey(g) {
    dots(
      g,
      pts([12, 23, 13, 24, 14, 25, 15, 26, 16, 26, 17, 25, 18, 24, 19, 23]),
      "A",
    );
    for (const [x, y] of pts([
      13, 23, 14, 24, 15, 25, 16, 25, 17, 24, 18, 23, 14, 23, 15, 24, 16, 24,
      17, 23, 15, 23, 16, 23,
    ]))
      put(g, x, y, x < 17 ? "S" : "s");
    for (const x of span(2, 7)) if (at(g, x, 29)) put(g, x, 29, "A");
    for (const x of span(24, 29)) if (at(g, x, 29)) put(g, x, 29, "a");
    // The number on the chest.
    dots(g, pts([20, 28, 21, 27, 21, 28, 21, 29, 21, 30, 20, 30, 22, 30]), "B");
  },
  bomber(g) {
    const rib = (x: number) => (x % 2 ? "A" : "a");
    for (const x of span(10, 21))
      for (const y of [22, 23]) if (at(g, x, y)) put(g, x, y, rib(x));
    dots(
      g,
      pts([
        13, 24, 14, 24, 15, 24, 16, 24, 17, 24, 18, 24, 14, 25, 15, 25, 16, 25,
        17, 25, 15, 26, 16, 26,
      ]),
      "B",
    );
    block(g, span(27, 31), [15], "d");
    block(g, span(27, 31), [16], "a");
    dots(g, pts([12, 24, 13, 25, 14, 26, 19, 24, 18, 25, 17, 26]), "d");
    for (const x of span(2, 29)) if (at(g, x, 31)) put(g, x, 31, rib(x));
  },
};

/** Neck, head and ears, then the chin's line where the jaw meets the neck. */
function drawHeadShape(g: Grid) {
  block(g, span(19, 23), span(13, 18), "s");
  for (const y of span(5, 21))
    for (const x of ALL) if (inside(HEAD, x, y)) g[y]![x] = x >= 20 ? "s" : "S";
  block(g, [13, 14, 15], [8], "S");
  block(g, [13, 14, 15], [23], "s");
  dots(g, pts([8, 14, 23, 14]), "o");
  for (const x of span(13, 18)) {
    let y = 21;
    while (y < 24 && is(g, x, y, "Ss") && inside(HEAD, x, y)) y++;
    put(g, x, y, "o");
  }
}

/** The cap of hair on the skull that most styles start from. */
function skullCap(g: Grid, ry = 5.8) {
  oval(g, [15.5, 10.6, 8.5, ry], 3, 10, "H");
}
/** A cap in the accent colour; `brim` is the side its visor points to. */
function drawCap(g: Grid, brim: readonly number[]) {
  for (const y of span(2, 9))
    for (const x of ALL) if (inside([15.5, 10, 8.4, 6.6], x, y)) g[y]![x] = "A";
  block(g, [10], span(7, 24), "a");
  block(g, [9], brim, "a");
  block(g, [10], brim, "A");
}

type Style = AvatarSpec["style"] | "cap" | "capLong" | "beanie";

/** Each hair style, and the three headgear drawings that stand in for the hair (cap, cap over
 * long hair, beanie): the avatars drawn before headgear was a slot of its own keep their look. */
const STYLES: Record<Style, (g: Grid) => void> = {
  spiky(g) {
    oval(g, [15.5, 10.5, 8.2, 6.2], 2, 10, "H");
    tri(g, [9, 2], 7, 12, 7, "H");
    tri(g, [15, 0], 12, 18, 6, "H");
    tri(g, [21, 1], 18, 24, 7, "H");
    tri(g, [25, 5], 22, 25, 9, "H");
    tri(g, [6, 6], 6, 9, 10, "H");
    for (const x of [11, 14, 17, 20]) tri(g, [x, 12], x - 2, x + 1, 9, "H");
    block(g, span(10, 14), [8, 9, 22, 23], "H");
  },
  beanie(g) {
    for (const y of span(1, 9))
      for (const x of ALL)
        if (inside([15.5, 9.2, 8.6, 7.4], x, y)) g[y]![x] = "A";
    block(g, [9, 10], span(7, 24), (x) => (x % 2 ? "a" : "B"));
    block(g, span(11, 14), [8, 9, 22, 23], "H");
    dots(g, pts([10, 11, 21, 11]), "H");
  },
  cap(g) {
    block(g, span(10, 13), [8, 9, 22, 23], "H");
    drawCap(g, span(1, 9));
    // The snapback's opening shows the hair.
    block(g, [8], span(13, 18), "H");
    dots(g, pts([15, 3, 16, 3]), "B");
  },
  capLong(g) {
    STYLES.long(g);
    drawCap(g, span(21, 29));
    dots(g, pts([15, 3, 16, 3]), "B");
  },
  bun(g) {
    oval(g, [15.5, 10.6, 8.4, 5.6], 4, 10, "H");
    oval(g, [15.5, 2.0, 4.0, 2.2], 0, 3, "H");
    for (const x of ALL) put(g, x, 4, null);
    block(g, [4], span(14, 17), "A");
    dots(g, pts([14, 1, 15, 1]), "l");
    for (const x of span(7, 24)) if (at(g, x, 8) === "H") put(g, x, 8, "A");
    block(g, span(10, 20), [8, 23], "H");
    block(g, span(10, 17), [9, 22], "H");
    tri(g, [12, 12], 10, 14, 10, "H");
  },
  afro(g) {
    for (const y of span(0, 16))
      for (const x of ALL) {
        if (!inside([15.5, 8.6, 11.6, 8.6], x, y)) continue;
        // Behind the face from the brow down.
        if (y >= 9 && (is(g, x, y, "Ss") || (x >= 10 && x <= 21))) continue;
        g[y]![x] = "H";
      }
    for (const [x, y] of pts([8, 3, 23, 3, 6, 7, 25, 7, 12, 1, 19, 1]))
      put(g, x, y, x < 16 ? "l" : "k");
  },
  buzz(g) {
    oval(g, [15.5, 10.6, 7.6, 6.2], 4, 9, "H");
    block(g, span(9, 12), [9, 22], "H");
  },
  long(g) {
    skullCap(g);
    dots(g, pts([15, 5, 15, 6]), "k");
    block(g, span(10, 19), [7, 8, 9, 22, 23, 24], "H");
    block(g, span(20, 27), [...span(5, 9), ...span(22, 26)], "H");
    for (const [y, x1] of pts([9, 20, 10, 15, 11, 12]))
      for (const x of span(9, x1))
        if (at(g, x, y) === null || is(g, x, y, "SsH")) put(g, x, y, "H");
  },
  bangs(g) {
    skullCap(g);
    dots(g, pts([15, 5, 15, 6]), "k");
    block(g, [9, 10], span(8, 23), "H");
    block(g, span(10, 18), [7, 8, 9, 22, 23, 24], "H");
  },
  space(g) {
    skullCap(g);
    dots(g, pts([15, 5, 15, 6]), "k");
    oval(g, [8.9, 3.3, 3.3, 3.1], 0, 7, "H");
    oval(g, [22.1, 3.3, 3.3, 3.1], 0, 7, "H");
    dots(g, pts([10, 6, 11, 6, 20, 6, 21, 6]), "A");
    block(g, span(10, 14), [8, 23], "H");
  },
  braids(g) {
    skullCap(g);
    dots(g, pts([15, 5, 15, 6]), "k");
    for (const y of span(10, 28)) {
      const [left, right] = y < 20 ? [8, 22] : [9, 21];
      block(g, [y], [left, left + 1, right, right + 1], (x) =>
        (x + y) % 2 ? "H" : "k",
      );
    }
    block(g, [28], [9, 10, 21, 22], "A");
    block(g, [29], [9, 10, 21, 22], "H");
  },
  puffs(g) {
    oval(g, [7.2, 6.4, 4.6, 4.4], 0, 12, "H");
    oval(g, [24.0, 6.4, 4.6, 4.4], 0, 12, "H");
    skullCap(g);
    dots(g, pts([10, 6, 11, 5, 20, 5, 21, 6]), "A");
  },
  pony(g) {
    oval(g, [25.2, 7.5, 3.0, 6.2], 1, 13, "H");
    skullCap(g);
    dots(g, pts([22, 4, 23, 4, 22, 5]), "A");
    block(g, span(10, 14), [8], "H");
  },
  mohawk(g) {
    for (const y of span(5, 9))
      for (const x of ALL)
        if (inside([15.5, 10.6, 7.4, 6.0], x, y) && (x + y) % 2 === 0)
          g[y]![x] = "k";
    const crest = [5, 2, 1, 0, 0, 1, 3, 6];
    crest.forEach((y0, i) => block(g, span(y0, 9), [12 + i], "H"));
    tri(g, [11, 11], 11, 14, 8, "H");
    dots(g, pts([14, 3, 14, 4, 15, 2]), "l");
  },
  flattop(g) {
    block(g, span(2, 9), span(8, 23), "H");
    block(g, [1], span(9, 22), "H");
    for (const y of span(10, 12))
      for (const x of [8, 9, 22, 23]) if ((x + y) % 2) put(g, x, y, "k");
    block(g, [2], span(10, 15), "l");
  },
  locs(g) {
    skullCap(g);
    const locs: Point[] = pts([4, 24, 6, 27, 8, 23, 22, 23, 24, 27, 26, 24]);
    locs.forEach(([x0, y1], i) => {
      block(g, span(i >= 1 && i <= 4 ? 8 : 10, y1), [x0, x0 + 1], (_, y) =>
        (y + i) % 3 === 0 ? "l" : "H",
      );
      // A bead at each tip.
      dots(
        g,
        [
          [x0, y1],
          [x0 + 1, y1],
        ],
        "A",
      );
    });
    for (const [x, y1] of pts([10, 12, 12, 11, 14, 10, 17, 10, 19, 11, 21, 12]))
      block(g, span(9, y1), [x], "H");
  },
  highpony(g) {
    for (const y of span(0, 23))
      for (const x of ALL)
        if (inside([26.6, 10.5, 3.2, 10.5], x, y) && !(y < 4 && x < 24))
          g[y]![x] = "H";
    dots(g, pts([27, 21, 28, 22, 28, 23, 29, 24, 26, 21, 27, 22]), "H");
    skullCap(g);
    for (const y of span(1, 4))
      for (const x of span(20, 25))
        if (inside([22.8, 3.2, 3.0, 2.4], x, y)) g[y]![x] = "H";
    dots(g, pts([22, 5, 23, 5, 24, 4]), "A");
    tri(g, [11, 13], 9, 14, 10, "H");
    block(g, span(10, 15), [8], "H");
  },
  bob(g) {
    skullCap(g);
    block(g, [9, 10], span(8, 23), "H");
    block(g, span(10, 17), [6, 7, 8, 9, 22, 23, 24, 25], "H");
    block(g, [18, 19], [7, 8, 9, 10, 21, 22, 23, 24], "H");
    dots(g, pts([10, 11, 21, 11]), "H");
  },
  twintails(g) {
    for (const [cx, side] of [
      [4.6, -1],
      [26.4, 1],
    ] as const)
      for (const y of span(7, 27))
        for (const x of ALL)
          if (inside([cx + side * (y - 8) * 0.06, 17, 2.7, 10.5], x, y))
            g[y]![x] = "H";
    skullCap(g);
    dots(g, pts([6, 8, 7, 8, 6, 9, 24, 8, 25, 8, 25, 9]), "A");
    block(g, [9, 10], span(9, 22), "H");
    dots(g, pts([15, 10, 16, 10]), "S");
  },
  flame(g) {
    oval(g, [15.5, 10.5, 8.6, 6.4], 2, 10, "H");
    tri(g, [7, 0], 5, 11, 9, "H");
    tri(g, [12, -3], 9, 15, 7, "H");
    tri(g, [18, -2], 14, 21, 7, "H");
    tri(g, [23, 0], 19, 25, 8, "H");
    tri(g, [27, 4], 22, 26, 10, "H");
    tri(g, [4, 5], 5, 9, 11, "H");
    tri(g, [13, 13], 11, 15, 9, "H");
    tri(g, [18, 12], 16, 20, 9, "H");
    tri(g, [10, 12], 8, 11, 9, "H");
    block(g, span(10, 14), [8, 23], "H");
  },
  sweep(g) {
    skullCap(g, 6.2);
    for (const y of span(9, 12)) block(g, [y], span(8, 21 - (y - 9) * 3), "H");
    block(g, span(10, 13), [22, 23], "k");
    tri(g, [9, 15], 8, 11, 12, "H");
  },
};

/** The drawing the hair slot gets: a cap or a beanie takes the hair's place, as before §2. */
function styleOf({ style, head }: AvatarSpec): Style {
  if (head === "cap") return style === "long" ? "capLong" : "cap";
  return head === "beanie" ? "beanie" : style;
}

/** Clears the hair `covered` hides. */
function tuck(
  g: Grid,
  ys: readonly number[],
  covered: (x: number, y: number) => boolean,
) {
  for (const y of ys)
    for (const x of ALL)
      if (is(g, x, y, "Hkl") && covered(x, y)) g[y]![x] = null;
}

const FACE_OPENING: Ellipse = [15.5, 13.8, 7.6, 8.6];
const HEADGEAR: Partial<Record<AvatarSpec["head"], (g: Grid) => void>> = {
  headband(g) {
    for (const y of [8, 9])
      for (const x of span(7, 24)) if (at(g, x, y)) put(g, x, y, "A");
    dots(g, pts([24, 8, 24, 9, 25, 9, 25, 8]), "a");
    // The knot's two tails, flying to the right.
    dots(
      g,
      pts([
        26, 8, 27, 7, 28, 7, 29, 6, 30, 6, 26, 7, 27, 6, 28, 6, 29, 5, 26, 10,
        27, 11, 28, 12, 29, 13, 26, 11, 27, 12, 28, 13, 29, 14, 30, 14,
      ]),
      "A",
    );
  },
  bandana(g) {
    tuck(g, span(0, 8), (x) => x > 6 && x < 25);
    for (const y of span(2, 9))
      for (const x of ALL)
        if (inside([15.5, 10, 8.4, 6.8], x, y))
          g[y]![x] = (x * 2 + y * 3) % 7 === 0 ? "B" : "A";
    block(g, [10], span(7, 24), "a");
    dots(g, pts([6, 9, 5, 8, 4, 8, 5, 10, 4, 11, 3, 12, 6, 11, 5, 12]), "A");
  },
  bucket(g) {
    tuck(g, span(0, 8), (x) => x > 6 && x < 25);
    for (const y of span(2, 8)) {
      const x0 = y === 2 ? 12 : y === 3 ? 11 : 10;
      block(g, [y], span(x0, 31 - x0), "A");
    }
    block(g, [8], span(10, 21), "a");
    block(g, [9], span(7, 24), "B");
    block(g, [10], span(5, 26), "A");
    block(g, [11], [...span(4, 7), ...span(24, 27)], "A");
  },
  hood(g) {
    tuck(g, span(0, 23), (x, y) => !inside(FACE_OPENING, x, y));
    for (const y of span(1, 23))
      for (const x of ALL) {
        if (
          !inside([15.5, 12.4, 10.4, 11.6], x, y) ||
          inside(FACE_OPENING, x, y)
        )
          continue;
        const lining = inside([15.5, 13.8, 8.7, 9.7], x, y);
        g[y]![x] = lining ? "d" : x >= 21 ? "c" : "C";
      }
  },
};

/** Hair in light from the top left: shade on the right third and where it meets the skin. */
function shadeHair(g: Grid) {
  for (const y of ALL)
    for (const x of ALL) {
      const key = g[y]![x];
      if (key === "H" && x >= 20) g[y]![x] = "k";
      else if (key === "H" && y < 10 && (x + y === 14 || x + y === 15))
        g[y]![x] = "l";
      else if (key === "A" && x >= 20) g[y]![x] = "a";
    }
  for (const y of span(0, SIZE - 2))
    for (const x of ALL)
      if (is(g, x, y, "Hl") && is(g, x, y + 1, "Ss")) g[y]![x] = "k";
}

const MOUTH: Point[] = pts([14, 18, 15, 18, 16, 18, 17, 17]);

function drawFeatures(g: Grid, { brows }: AvatarSpec) {
  if (brows === "fierce")
    dots(
      g,
      pts([
        10, 9, 11, 9, 11, 10, 12, 10, 13, 10, 13, 11, 14, 11, 21, 9, 20, 9, 20,
        10, 19, 10, 18, 10, 18, 11, 17, 11,
      ]),
      "O",
    );
  else
    for (const [x, y] of pts([11, 10, 12, 10, 13, 11, 18, 11, 19, 10, 20, 10]))
      if (is(g, x, y, "Ss")) put(g, x, y, "O");
  block(g, [12], [...span(10, 13), ...span(18, 21)], "O");
  dots(g, pts([12, 13, 18, 13]), "W");
  dots(g, pts([13, 13, 12, 14, 13, 14, 19, 13, 18, 14, 19, 14]), "E");
  dots(g, pts([16, 15, 16, 16]), "o");
  dots(g, MOUTH, "o");
  dots(g, pts([11, 15, 20, 15]), "r");
}

function drawGrin(g: Grid) {
  dots(g, pts([13, 17, 18, 17]), "o");
  block(g, [18], [13, 18], "O");
  block(g, [18], span(14, 17), "W");
  block(g, [19], span(14, 17), "o");
}

const FACE_ITEMS: Partial<Record<AvatarSpec["face"], (g: Grid) => void>> = {
  shades(g) {
    const lenses = [...span(10, 14), ...span(17, 21)];
    block(g, [12, 13], lenses, "Q");
    block(
      g,
      [14],
      lenses.filter((x) => ![10, 14, 17, 21].includes(x)),
      "Q",
    );
    dots(g, pts([15, 12, 16, 12, 9, 12, 22, 12, 8, 12, 23, 12]), "Q");
    dots(g, pts([11, 12, 12, 12, 18, 12, 19, 12]), "P");
  },
  plaster(g) {
    dots(g, pts([15, 15, 16, 15]), "W");
    dots(g, pts([14, 15, 17, 15]), "g");
  },
  scar(g) {
    dots(g, pts([20, 14, 20, 15, 19, 16, 19, 17, 21, 15, 18, 16]), "L");
  },
  mask(g) {
    for (const y of span(16, 22))
      for (const x of span(8, 23))
        if (is(g, x, y, "SsorOWL")) put(g, x, y, x >= 20 ? "a" : "A");
    for (const x of span(9, 22))
      if (is(g, x, 16, "Aa")) put(g, x, 16, x < 20 ? "B" : "A");
    dots(g, pts([14, 19, 15, 20, 16, 20, 17, 19]), "a");
  },
  paint(g) {
    dots(
      g,
      pts([10, 15, 11, 15, 10, 17, 11, 17, 20, 15, 21, 15, 20, 17, 21, 17]),
      "A",
    );
  },
};

function drawDetails(g: Grid, spec: AvatarSpec) {
  if (spec.lashes) dots(g, pts([9, 12, 22, 12, 10, 11, 21, 11]), "O");
  if (spec.lips) dots(g, MOUTH, "L");
  if (spec.hoops)
    for (const [x, y] of pts([
      8, 16, 7, 17, 8, 18, 9, 17, 23, 16, 24, 17, 23, 18, 22, 17,
    ]))
      if (at(g, x, y) === null || is(g, x, y, "SsoCcd")) put(g, x, y, "G");
}

const EXTRAS: Partial<Record<AvatarSpec["extra"], (g: Grid) => void>> = {
  phones(g) {
    block(g, [24], span(11, 20), "A");
    for (const x0 of [8, 20]) {
      block(g, [23, 24], span(x0, x0 + 3), "Q");
      block(g, [22, 25], [x0 + 1, x0 + 2], "Q");
      dots(
        g,
        [
          [x0 + 1, 23],
          [x0 + 2, 23],
          [x0 + 1, 24],
        ],
        "P",
      );
    }
  },
  chain(g) {
    for (const [x, y] of pts([
      11, 23, 12, 24, 13, 25, 14, 26, 15, 26, 16, 26, 17, 26, 18, 25, 19, 24,
      20, 23,
    ]))
      put(g, x, y, (x + y) % 2 ? "G" : "g");
    put(g, 15, 27, "G");
    put(g, 16, 27, "g");
  },
};

/** A 1px ink line around the figure, lit by the stage's rim light on its right edge. */
function outlined(g: Grid): Grid {
  // Ink features (brows, lashes) are lines themselves: they cast no outline.
  const solid = (x: number, y: number) =>
    at(g, x, y) !== null && at(g, x, y) !== "O";
  return g.map((row, y) =>
    row.map((key, x) => {
      if (key !== null) return key;
      if (x >= 17 && y < 30 && solid(x - 1, y)) return "R";
      const edge =
        solid(x + 1, y) ||
        solid(x - 1, y) ||
        solid(x, y + 1) ||
        solid(x, y - 1);
      return edge ? "O" : null;
    }),
  );
}

/** The figure in palette keys, outline included. */
function drawFigure(spec: AvatarSpec): Grid {
  const g = blank();
  drawTorso(g);
  drawOutfit(g, spec.outfit);
  drawHeadShape(g);
  STYLES[styleOf(spec)](g);
  HEADGEAR[spec.head]?.(g);
  shadeHair(g);
  drawFeatures(g, spec);
  if (spec.mouth === "grin") drawGrin(g);
  FACE_ITEMS[spec.face]?.(g);
  drawDetails(g, spec);
  EXTRAS[spec.extra]?.(g);
  return outlined(g);
}

/** The "record" rings of the plain stage, centred off its top right corner. */
function rings(): FxPixel[] {
  const hit = (x: number, y: number) => {
    const d = Math.hypot(x + 0.5 - 27, y + 0.5 - 4);
    return [9, 14, 19, 24].some((r) => Math.abs(d - r) < 0.5);
  };
  return ALL.flatMap((y) =>
    ALL.filter((x) => hit(x, y)).map((x): FxPixel => [x, y, "ring"]),
  );
}

/** Speed lines: every other of 28 wedges around the face, from 6px out. */
function burst(): FxPixel[] {
  const hit = (x: number, y: number) => {
    const [dx, dy] = [x + 0.5 - 16, y + 0.5 - 15];
    const turn = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
    return Math.hypot(dx, dy) > 6 && Math.floor(turn * 28) % 2 === 0;
  };
  return ALL.flatMap((y) =>
    ALL.filter((x) => hit(x, y)).map((x): FxPixel => [x, y, "ring"]),
  );
}

/** Dots on a 4px grid that grow towards the top right. */
function halftone(): FxPixel[] {
  const pixels: FxPixel[] = [];
  for (const y of ALL)
    for (const x of ALL) {
      const t = (x + (31 - y)) / 62;
      const [mx, my] = [x % 4, y % 4];
      if (mx === 1 && my === 1 && t > 0.25) pixels.push([x, y, "ring"]);
      if (t > 0.6 && (mx === 1 || mx === 2) && (my === 1 || my === 2))
        pixels.push([x, y, "ring"]);
      if (t > 0.85 && mx <= 2 && my <= 2) pixels.push([x, y, "ring"]);
    }
  return pixels;
}

/** Flames rising off the figure's top edge, and a glow along its sides. */
function aura(figure: Grid): FxPixel[] {
  const filled = (x: number, y: number) => at(figure, x, y) !== null;
  const topOf = (x: number) => ALL.find((y) => filled(x, y));
  const heights = [3, 5, 2, 6, 3, 4, 7, 3, 5, 2, 4, 6];
  const pixels: FxPixel[] = [];
  for (const x of ALL) {
    const beside = [topOf(x - 1), topOf(x + 1)].filter((y) => y !== undefined);
    const top = topOf(x) ?? (beside.length ? Math.min(...beside) : undefined);
    if (top === undefined) continue;
    const height = heights[x % heights.length]!;
    for (const y of span(Math.max(0, top - height), top - 1))
      pixels.push([x, y, y >= top - 2 ? "rim" : "ring"]);
  }
  for (const y of ALL)
    for (const x of ALL) {
      if (filled(x, y) || (x + y) % 3 === 0) continue;
      const dx = [-2, -1, 1, 2].find((d) => filled(x + d, y));
      if (dx !== undefined)
        pixels.push([x, y, Math.abs(dx) === 1 ? "rim" : "ring"]);
    }
  return pixels;
}

/** A skyline with lit windows. */
function city(): FxPixel[] {
  const roofs = [
    20, 20, 14, 14, 14, 18, 18, 11, 11, 11, 16, 16, 21, 21, 13, 13, 13, 17, 17,
    9, 9, 9, 15, 15, 19, 19, 12, 12, 12, 18, 18, 18,
  ];
  return roofs.flatMap((roof, x): FxPixel[] => [
    ...span(roof, 31).map((y): FxPixel => [x, y, "ring"]),
    ...(x % 2 === 0
      ? span(roof + 2, 29)
          .filter((y) => (y - roof - 2) % 3 === 0)
          .map((y): FxPixel => [x, y, "rim"])
      : []),
  ]);
}

const EFFECTS: Record<AvatarSpec["fx"], (figure: Grid) => FxPixel[]> = {
  rings,
  burst,
  halftone,
  aura,
  city,
};

/** The avatar as colours: the stage, its effect's pixels, and the 32×32 sprite. */
export function renderAvatar(spec: AvatarSpec): AvatarRender {
  const [S, s, o] = SKINS[spec.skin];
  const [H, k, l] = HAIRS[spec.hair];
  const [C, c, d] = CLOTHS[spec.cloth];
  const [A, a, B] = ACCENTS[spec.accent];
  const [background, ring, rim] = STAGES[spec.bg];
  const palette: Record<Key, string> = {
    ...{ S, s, o, r: o, H, k, l, C, c, d, A, a, B },
    ...{ O: OUTLINE, R: rim, W: "#FFFFFF", E: "#151A33", L: "#B4475F" },
    ...{ P: "#2A3150", Q: "#0F1220", G: "#E3E8F4", g: "#9AA3BC" },
  };
  const figure = drawFigure(spec);
  return {
    background,
    ring,
    rim,
    fx: EFFECTS[spec.fx](figure),
    sprite: figure.map((row) => row.map((key) => (key ? palette[key]! : null))),
  };
}

/** The slots picked by colour, each value with the colour that stands for it. */
export const AVATAR_COLOURS = {
  skin: SKINS,
  hair: HAIRS,
  accent: ACCENTS,
  cloth: CLOTHS,
  bg: STAGES,
} as const;

/** A random avatar: any value per slot, headgear and face item left off half the time. */
export function randomAvatar(): AvatarSpec {
  const pick = <T>(values: readonly T[]) =>
    values[Math.floor(Math.random() * values.length)]!;
  const slots = Object.fromEntries(
    Object.entries(AVATAR_OPTIONS).map(([slot, values]) => [
      slot,
      pick(values),
    ]),
  ) as Pick<AvatarSpec, keyof Options>;
  // Everything on at once is a crowded face.
  const bare = () => Math.random() < 0.5;
  return {
    ...slots,
    head: bare() ? "none" : slots.head,
    face: bare() ? "none" : slots.face,
    lashes: Math.random() < 1 / 3,
    lips: Math.random() < 1 / 3,
    hoops: Math.random() < 1 / 3,
  };
}
