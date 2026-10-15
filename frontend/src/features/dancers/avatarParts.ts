// The generated pixel avatar (DESIGN.md §4.16): a 32×32 bust drawn from six parts. Pure, so
// the drawing is tested without a browser; `PixelAvatar.tsx` turns the grid into SVG.

/** The six parts, each an index into its option list below. */
export type AvatarParts = {
  hair: number;
  skin: number;
  hairColour: number;
  hoodie: number;
  extra: number;
  backdrop: number;
};

type Part = keyof AvatarParts;

/** Each part's code letter and option names, in the order of `dancers.avatar_parts`. */
export const PARTS: { part: Part; letter: string; options: string[] }[] = [
  {
    part: "hair",
    letter: "h",
    options: ["spiky", "cap", "beanie", "bun", "afro", "buzz"],
  },
  { part: "skin", letter: "s", options: ["light", "tan", "medium", "deep"] },
  {
    part: "hairColour",
    letter: "c",
    options: ["black", "brown", "bleached", "violet", "klein"],
  },
  {
    part: "hoodie",
    letter: "o",
    options: ["ink", "klein", "violet", "white", "red"],
  },
  { part: "extra", letter: "e", options: ["none", "headphones", "chain"] },
  {
    part: "backdrop",
    letter: "b",
    options: ["klein", "violet", "ink", "night"],
  },
];

/** `h2-s1-c0-o3-e0-b1`: how `dancers.avatar_parts` stores a choice. */
export function formatParts(parts: AvatarParts): string {
  return PARTS.map(({ part, letter }) => `${letter}${parts[part]}`).join("-");
}

/** The stored code as parts; null when blank or malformed (then the seed decides). */
export function parseParts(
  code: string | null | undefined,
): AvatarParts | null {
  const pieces = code?.trim().split("-") ?? [];
  if (pieces.length !== PARTS.length) return null;
  const parts = {} as AvatarParts;
  for (const [i, { part, letter, options }] of PARTS.entries()) {
    const piece = pieces[i] ?? "";
    const n = Number(piece.slice(1));
    if (
      piece[0] !== letter ||
      !/^\d$/.test(piece.slice(1)) ||
      n >= options.length
    )
      return null;
    parts[part] = n;
  }
  return parts;
}

/** FNV-1a, then a murmur finaliser so neighbouring ids spread out. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Parts derived from the dancer id: the same id always draws the same face (§4.16). */
export function seededParts(id: string): AvatarParts {
  let h = hash(id);
  const pick = (n: number) => {
    const value = h % n;
    h = Math.floor(h / n);
    return value;
  };
  const parts = {
    hair: pick(6),
    skin: pick(4),
    hairColour: pick(5),
    hoodie: pick(5),
    extra: pick(3),
    backdrop: pick(4),
  };
  // A hoodie the colour of its backdrop disappears; the next one never clashes.
  if (CLASHES[parts.backdrop] === parts.hoodie) parts.hoodie += 1;
  return parts;
}

// The hoodie each backdrop would swallow: klein, violet, ink, ink (night).
const CLASHES = [1, 2, 0, 0];

/** The parts a dancer is drawn with: the chosen ones, else the seed. */
export function partsOf(dancer: { id: string; avatar_parts?: string | null }) {
  return parseParts(dancer.avatar_parts) ?? seededParts(dancer.id);
}

const INK = "#0B0D14";
const SKINS = [
  { base: "#F4D2B5", shade: "#DDAB88", feature: "#B97E5E" },
  { base: "#E3AA78", shade: "#C18556", feature: "#97603B" },
  { base: "#AA6B40", shade: "#87502D", feature: "#683A1E" },
  { base: "#71432A", shade: "#57321D", feature: "#3E2113" },
];
const HAIR = [
  { base: "#2A2C3A", shade: "#171822", light: "#5B5F7A" },
  { base: "#5E3B22", shade: "#432A18", light: "#8F5F37" },
  { base: "#EAD48C", shade: "#C6AC5E", light: "#FFF6CF" },
  { base: "#7444F6", shade: "#4E25C2", light: "#B49BFF" },
  { base: "#2F5BFF", shade: "#1C40C8", light: "#8FAAFF" },
];
const HOODIES = [
  { base: "#1F2436", shade: "#121521", detail: "#6B7391" },
  { base: "#2F5BFF", shade: "#0A35B3", detail: "#A9BDFF" },
  { base: "#6D3AF5", shade: "#4B22BF", detail: "#C2AEFF" },
  { base: "#F3F5FA", shade: "#C3C9D9", detail: "#7D86A0" },
  { base: "#E5484D", shade: "#AF2730", detail: "#FFC2C4" },
];
const BACKDROPS = [
  { base: "#002FA7", ring: "#1A44C2", rim: "#A9BDFF" },
  { base: "#5A2BE0", ring: "#6D3AF5", rim: "#D4C6FF" },
  { base: "#0B0D14", ring: "#1C2133", rim: "#7D86A0" },
  { base: "#141826", ring: "#283048", rim: "#8FAAFF" },
];
const EYE = "#2B2233";
const GOLD = ["#F2C14E", "#C7952B"];
const PHONES = { base: "#1C2133", light: "#6B7391" };

/** A drawing surface: colours, and which pixels belong to the figure (for outline and rim). */
class Grid {
  colours: string[][];
  figure: boolean[][];
  constructor(background: string) {
    this.colours = Array.from({ length: 32 }, () => Array(32).fill(background));
    this.figure = Array.from({ length: 32 }, () => Array(32).fill(false));
  }
  /** Paints x0..x1 on row y; `figure` pixels get an outline around them. */
  row(
    y: number,
    x0: number,
    x1: number,
    colour: (x: number) => string,
    figure = true,
  ) {
    for (let x = Math.max(0, x0); x <= Math.min(31, x1); x++) {
      if (y < 0 || y > 31) continue;
      this.colours[y]![x] = colour(x);
      if (figure) this.figure[y]![x] = true;
    }
  }
  dot(x: number, y: number, colour: string, figure = true) {
    this.row(y, x, x, () => colour, figure);
  }
  /** Rows given as `{ y: [x0, x1] }`. */
  shape(
    rows: Record<number, [number, number]>,
    colour: (x: number, y: number) => string,
  ) {
    for (const [y, [x0, x1]] of Object.entries(rows)) {
      this.row(Number(y), x0, x1, (x) => colour(x, Number(y)));
    }
  }
}

/** The 32×32 sprite as a grid of colours, top row first. */
export function drawAvatar(parts: AvatarParts): string[][] {
  const backdrop = BACKDROPS[parts.backdrop]!;
  const grid = new Grid(backdrop.base);
  drawRings(grid, backdrop.ring);
  const hoodie = HOODIES[parts.hoodie]!;
  const hair = HAIR[parts.hairColour]!;
  const skin = SKINS[parts.skin]!;

  drawBody(grid, hoodie);
  if (parts.extra === 1) drawHeadphones(grid);
  if (parts.hair === 4) drawAfro(grid, hair);
  drawHead(grid, skin);
  drawFace(grid, skin, hair);
  HAIRSTYLES[parts.hair]!(grid, hair, hoodie);
  if (parts.extra === 2) drawChain(grid);
  outline(grid);
  rimLight(grid, backdrop.rim);
  return grid.colours;
}

/** Pixel "record" rings behind the bust (§4.16 backdrop). */
function drawRings(grid: Grid, colour: string) {
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 13);
      if ([8, 12, 16].some((r) => Math.abs(d - r) < 0.5))
        grid.dot(x, y, colour, false);
    }
  }
}

function drawBody(grid: Grid, hoodie: (typeof HOODIES)[number]) {
  const lit = (x: number) => (x >= 22 ? hoodie.shade : hoodie.base);
  // The hood behind the head, showing at the jaw.
  grid.shape(
    {
      18: [9, 22],
      19: [8, 23],
      20: [8, 23],
      21: [8, 23],
      22: [8, 23],
      23: [8, 23],
    },
    (x) => (x >= 21 ? hoodie.shade : hoodie.base),
  );
  grid.shape(
    {
      24: [7, 24],
      25: [5, 26],
      26: [4, 27],
      27: [3, 28],
      28: [3, 28],
      29: [3, 28],
      30: [3, 28],
      31: [3, 28],
    },
    lit,
  );
  // Neckline, drawstrings and the pocket seam, in the hoodie's own tones.
  grid.row(24, 13, 18, () => hoodie.shade);
  for (let y = 25; y <= 28; y++) {
    grid.dot(13, y, hoodie.detail);
    grid.dot(18, y, hoodie.detail);
  }
  grid.row(30, 10, 21, () => hoodie.shade);
}

function drawHead(grid: Grid, skin: (typeof SKINS)[number]) {
  // Neck in the chin's shadow.
  grid.shape({ 21: [14, 17], 22: [14, 17], 23: [14, 17] }, () => skin.shade);
  // Cel shading, lit from the top-left: the right side and the chin take the shade.
  const lit = (x: number, y: number) =>
    x >= 20 || y >= 20 || (x >= 19 && y >= 17) ? skin.shade : skin.base;
  grid.shape(
    {
      8: [12, 19],
      9: [11, 20],
      10: [10, 21],
      11: [10, 21],
      12: [10, 21],
      13: [10, 21],
      14: [10, 21],
      15: [10, 21],
      16: [10, 21],
      17: [10, 21],
      18: [10, 21],
      19: [11, 20],
      20: [12, 19],
      21: [13, 18],
    },
    lit,
  );
  for (let y = 13; y <= 15; y++) {
    grid.dot(9, y, y === 14 ? skin.feature : skin.base);
    grid.dot(22, y, y === 14 ? skin.feature : skin.shade);
  }
}

function drawFace(
  grid: Grid,
  skin: (typeof SKINS)[number],
  hair: (typeof HAIR)[number],
) {
  // Angled brows, low at the centre.
  for (const [x, y] of [
    [11, 11],
    [12, 11],
    [13, 12],
    [14, 12],
    [17, 12],
    [18, 12],
    [19, 11],
    [20, 11],
  ] as const) {
    grid.dot(x, y, hair.shade);
  }
  // Anime eyes: a 4px lash line, a 2×2 iris, a white catch-light.
  for (const left of [11, 17]) {
    grid.row(13, left, left + 3, () => INK);
    grid.row(14, left + 1, left + 2, () => EYE);
    grid.row(15, left + 1, left + 2, () => EYE);
    grid.dot(left + 1, 14, "#FFFFFF");
  }
  // Nose and mouth in a darker skin tone, never black.
  grid.dot(16, 16, skin.feature);
  grid.dot(16, 17, skin.feature);
  grid.row(19, 14, 16, () => skin.feature);
  grid.dot(17, 18, skin.feature);
}

type HairStyle = (
  grid: Grid,
  hair: (typeof HAIR)[number],
  hoodie: (typeof HOODIES)[number],
) => void;

/** Hair shaded on the right, with a 1px diagonal highlight streak (§4.16). */
function hairPaint(hair: (typeof HAIR)[number]) {
  return (x: number) => (x >= 19 ? hair.shade : hair.base);
}

function streak(grid: Grid, colour: string, points: [number, number][]) {
  for (const [x, y] of points) grid.dot(x, y, colour);
}

function sideburns(grid: Grid, colour: string, from: number, to: number) {
  for (let y = from; y <= to; y++) {
    grid.dot(9, y, colour);
    grid.dot(22, y, colour);
  }
}

const spiky: HairStyle = (grid, hair) => {
  const paint = hairPaint(hair);
  // Spikes leaning left, rising from the crown.
  for (const [apex, top] of [
    [10, 4],
    [14, 2],
    [18, 3],
    [21, 5],
  ] as const) {
    for (let y = top; y <= 6; y++)
      grid.row(y, apex - (y - top), apex + Math.floor((y - top) / 2), paint);
  }
  grid.shape(
    { 6: [11, 20], 7: [10, 21], 8: [9, 22], 9: [9, 22], 10: [9, 22] },
    paint,
  );
  for (const x of [9, 10, 13, 14, 18, 21, 22]) grid.dot(x, 11, paint(x));
  sideburns(grid, hair.shade, 12, 13);
  streak(grid, hair.light, [
    [12, 8],
    [13, 7],
    [14, 6],
    [15, 5],
  ]);
};

const cap: HairStyle = (grid, hair, hoodie) => {
  // The cap matches the hoodie; the brim points to the side.
  const fabric = (x: number) => (x >= 19 ? hoodie.shade : hoodie.base);
  grid.shape(
    { 4: [12, 19], 5: [11, 20], 6: [10, 21], 7: [10, 21], 8: [10, 21] },
    fabric,
  );
  grid.row(9, 9, 22, () => hoodie.shade);
  grid.shape({ 9: [3, 9], 10: [4, 9] }, () => hoodie.shade);
  grid.dot(15, 3, hoodie.shade);
  grid.row(5, 12, 13, () => hoodie.detail);
  grid.shape({ 10: [10, 11] }, () => hair.base);
  grid.dot(21, 10, hair.shade);
  sideburns(grid, hair.shade, 11, 13);
};

const beanie: HairStyle = (grid, hair, hoodie) => {
  const knit = (x: number) => (x >= 19 ? hoodie.shade : hoodie.base);
  grid.shape(
    { 3: [13, 18], 4: [11, 20], 5: [10, 21], 6: [9, 22], 7: [9, 22] },
    knit,
  );
  // The folded cuff, ribbed.
  grid.shape({ 8: [9, 22], 9: [9, 22] }, (x) =>
    x % 2 === 0 ? hoodie.shade : hoodie.base,
  );
  grid.row(4, 12, 13, () => hoodie.detail);
  const paint = hairPaint(hair);
  for (const x of [10, 11, 13, 14, 16, 19, 20, 21]) grid.dot(x, 10, paint(x));
  sideburns(grid, hair.shade, 10, 13);
};

const bun: HairStyle = (grid, hair, hoodie) => {
  const paint = hairPaint(hair);
  grid.shape(
    { 1: [14, 17], 2: [13, 18], 3: [13, 18], 4: [13, 18], 5: [14, 17] },
    paint,
  );
  grid.shape({ 6: [11, 20], 7: [10, 21], 8: [10, 21], 9: [9, 22] }, paint);
  grid.row(10, 9, 10, () => hair.base);
  grid.row(10, 21, 22, () => hair.shade);
  sideburns(grid, hair.shade, 11, 13);
  // The headband, in the hoodie's colour.
  grid.row(8, 10, 21, () => hoodie.base);
  streak(grid, hair.light, [
    [14, 3],
    [15, 2],
    [12, 7],
    [13, 6],
  ]);
};

/** The afro's mass sits behind the face; its front edge is drawn over it. */
function drawAfro(grid: Grid, hair: (typeof HAIR)[number]) {
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 32; x++) {
      if (Math.hypot((x - 15.5) / 1.05, y - 8.5) < 9.6) {
        // A rough texture: scattered shade, denser on the right.
        const rough = (x * 7 + y * 13) % (x >= 16 ? 3 : 5) === 0;
        grid.dot(x, y, rough || x >= 21 ? hair.shade : hair.base);
      }
    }
  }
}

const afro: HairStyle = (grid, hair) => {
  const paint = hairPaint(hair);
  grid.shape({ 8: [10, 21], 9: [10, 21] }, paint);
  for (const x of [10, 12, 13, 15, 18, 20, 21]) grid.dot(x, 10, paint(x));
  streak(grid, hair.light, [
    [9, 5],
    [10, 4],
    [11, 3],
    [12, 2],
  ]);
};

const buzz: HairStyle = (grid, hair) => {
  const paint = hairPaint(hair);
  grid.shape({ 7: [11, 20], 8: [10, 21], 9: [10, 21] }, paint);
  grid.row(10, 10, 11, () => hair.base);
  grid.row(10, 20, 21, () => hair.shade);
  streak(grid, hair.light, [
    [12, 8],
    [13, 7],
  ]);
};

const HAIRSTYLES: HairStyle[] = [spiky, cap, beanie, bun, afro, buzz];

/** Cups on the collarbones, the band behind the neck. */
function drawHeadphones(grid: Grid) {
  grid.row(22, 12, 19, () => PHONES.base);
  for (const left of [9, 20]) {
    grid.shape(
      { 22: [left, left + 2], 23: [left, left + 2], 24: [left, left + 2] },
      () => PHONES.base,
    );
    grid.dot(left, 22, PHONES.light);
  }
}

function drawChain(grid: Grid) {
  const links: [number, number][] = [
    [11, 25],
    [12, 26],
    [13, 27],
    [14, 28],
    [15, 29],
    [16, 29],
    [17, 28],
    [18, 27],
    [19, 26],
    [20, 25],
  ];
  links.forEach(([x, y], i) => grid.dot(x, y, GOLD[i % 2]!));
  grid.row(30, 15, 16, () => GOLD[0]!);
}

/** A 1px ink line around the silhouette (§4.16). */
function outline(grid: Grid) {
  const edge: [number, number][] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (grid.figure[y]![x]) continue;
      const near = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => grid.figure[ny!]?.[nx!]);
      if (near) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) grid.colours[y]![x] = INK;
}

/** A 1px rim light in the backdrop's light tint on the right edge of the silhouette. */
function rimLight(grid: Grid, colour: string) {
  for (let y = 0; y < 32; y++) {
    const x = grid.figure[y]!.lastIndexOf(true);
    if (x >= 16) grid.colours[y]![x] = colour;
  }
}
