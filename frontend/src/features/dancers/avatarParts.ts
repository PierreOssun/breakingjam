// The generated pixel avatar (DESIGN.md §4.16): a 32×32 bust drawn from six parts and
// optional details. Pure, so the drawing is tested without a browser; `PixelAvatar.tsx` turns
// the grid into SVG. `frontend/pixel-avatar-generator.py` is the reference drawing.

/** The six parts, each an index into its option list below, and the details as a bitmask. */
export type AvatarParts = {
  hair: number;
  skin: number;
  hairColour: number;
  hoodie: number;
  extra: number;
  backdrop: number;
  /** Bits of `DETAILS`; 0 for none. */
  details: number;
};

type Part = Exclude<keyof AvatarParts, "details">;

/** Each part's code letter and option names, in the order of `dancers.avatar_parts`. */
export const PARTS: { part: Part; letter: string; options: string[] }[] = [
  {
    part: "hair",
    letter: "h",
    // New styles go at the end: stored codes keep pointing at the same hair.
    options: [
      "spiky",
      "cap",
      "beanie",
      "bun",
      "afro",
      "buzz",
      "long",
      "spaceBuns",
      "braids",
      "puffs",
      "ponytail",
      "bob",
      "capLong",
    ],
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

/** The details any avatar may combine, each one bit of `AvatarParts.details`. */
export const DETAILS = [
  { name: "lashes", bit: 1 },
  { name: "lips", bit: 2 },
  { name: "hoops", bit: 4 },
] as const;

type Detail = (typeof DETAILS)[number]["name"];

/** Whether the avatar has that detail on. */
export function hasDetail(parts: AvatarParts, name: Detail): boolean {
  return DETAILS.some((d) => d.name === name && (parts.details & d.bit) !== 0);
}

/** `h2-s1-c0-o3-e0-b1`, then `-d5` when details are on: how `dancers.avatar_parts` stores a choice. */
export function formatParts(parts: AvatarParts): string {
  const code = PARTS.map(({ part, letter }) => `${letter}${parts[part]}`);
  return [...code, ...(parts.details ? [`d${parts.details}`] : [])].join("-");
}

/** The stored code as parts; null when blank or malformed (then the seed decides). */
export function parseParts(
  code: string | null | undefined,
): AvatarParts | null {
  const pieces = code?.trim().split("-") ?? [];
  if (pieces.length !== PARTS.length && pieces.length !== PARTS.length + 1)
    return null;
  const number = (piece: string | undefined, letter: string, count: number) => {
    const digits = piece?.slice(1) ?? "";
    const n = Number(digits);
    return piece?.[0] === letter && /^\d{1,2}$/.test(digits) && n < count
      ? n
      : null;
  };
  const parts = { details: 0 } as AvatarParts;
  for (const [i, { part, letter, options }] of PARTS.entries()) {
    const n = number(pieces[i], letter, options.length);
    if (n === null) return null;
    parts[part] = n;
  }
  if (pieces.length > PARTS.length) {
    const details = number(pieces[PARTS.length], "d", 8);
    if (details === null) return null;
    parts.details = details;
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
  // Every style is equally likely and no part is tied to a gender; each detail is on one
  // time in three (§4.16). Bgirls and bboys get theirs from their battles (the API).
  const parts = {
    hair: pick(13),
    skin: pick(4),
    hairColour: pick(5),
    hoodie: pick(5),
    extra: pick(3),
    backdrop: pick(4),
    details: DETAILS.reduce(
      (bits, { bit }) => bits | (pick(3) === 0 ? bit : 0),
      0,
    ),
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
const LIP = "#B4475F";
const SILVER = ["#E3E8F4", "#9AA3BC"];
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
  drawMakeUp(grid, parts);
  HAIRSTYLES[parts.hair]!(grid, hair, hoodie);
  // Over the hair: hoops show even under long hair.
  if (hasDetail(parts, "hoops")) drawHoops(grid);
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

/** A cap in the hoodie's colours, its brim pointing to one side. */
function capCrown(
  grid: Grid,
  hoodie: (typeof HOODIES)[number],
  brim: "left" | "right",
) {
  const fabric = (x: number) => (x >= 19 ? hoodie.shade : hoodie.base);
  grid.shape(
    { 4: [12, 19], 5: [11, 20], 6: [10, 21], 7: [10, 21], 8: [10, 21] },
    fabric,
  );
  grid.row(9, 9, 22, () => hoodie.shade);
  grid.shape(
    brim === "left" ? { 9: [3, 9], 10: [4, 9] } : { 9: [22, 28], 10: [22, 27] },
    () => hoodie.shade,
  );
  grid.dot(15, 3, hoodie.shade);
  grid.row(5, 12, 13, () => hoodie.detail);
}

const cap: HairStyle = (grid, hair, hoodie) => {
  capCrown(grid, hoodie, "left");
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

/** Hair over the top of the head, for the long and tied-up styles; a parting at the centre. */
function crown(grid: Grid, hair: (typeof HAIR)[number]) {
  grid.shape(
    {
      4: [12, 19],
      5: [11, 20],
      6: [10, 21],
      7: [9, 22],
      8: [9, 22],
      9: [9, 22],
    },
    hairPaint(hair),
  );
  grid.row(10, 9, 10, () => hair.base);
  grid.row(10, 21, 22, () => hair.shade);
}

function parting(grid: Grid, hair: (typeof HAIR)[number]) {
  for (const y of [5, 6, 7]) grid.dot(15, y, hair.shade);
}

/** Hair falling past the ears onto the shoulders, wider below the jaw, cut straight at `to`. */
function curtains(grid: Grid, hair: (typeof HAIR)[number], to: number) {
  for (let y = 10; y <= to; y++) {
    const [left, right] = y < 20 ? [7, 24] : [6, 25];
    grid.row(y, left, 9, () => hair.base);
    grid.row(y, 22, right, () => hair.shade);
  }
}

/** A filled disc of hair, rough like the afro. */
function puff(
  grid: Grid,
  hair: (typeof HAIR)[number],
  cx: number,
  cy: number,
  r: number,
) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (Math.hypot(x - cx, y - cy) >= r) continue;
      const rough = (x * 7 + y * 13) % (x >= cx ? 3 : 5) === 0;
      grid.dot(x, y, rough || x >= cx + r / 2 ? hair.shade : hair.base);
    }
  }
}

const long: HairStyle = (grid, hair) => {
  curtains(grid, hair, 27);
  crown(grid, hair);
  parting(grid, hair);
  // A side fringe swept over the left of the forehead, clear of the brow.
  grid.row(10, 11, 14, () => hair.base);
  grid.dot(10, 11, hair.base);
  streak(grid, hair.light, [
    [11, 7],
    [12, 6],
    [13, 5],
  ]);
};

const spaceBuns: HairStyle = (grid, hair, hoodie) => {
  crown(grid, hair);
  puff(grid, hair, 10.5, 3.5, 3.2);
  puff(grid, hair, 20.5, 3.5, 3.2);
  parting(grid, hair);
  // Hair ties where each bun meets the head.
  grid.row(6, 10, 12, () => hoodie.base);
  grid.row(6, 19, 21, () => hoodie.base);
  sideburns(grid, hair.shade, 11, 13);
};

const braids: HairStyle = (grid, hair, hoodie) => {
  crown(grid, hair);
  parting(grid, hair);
  sideburns(grid, hair.shade, 11, 12);
  // Two plaited braids on each side, with a bead and a tip.
  for (let y = 10; y <= 27; y++) {
    const columns = y < 20 ? [7, 8, 23, 24] : [8, 9, 22, 23];
    for (const x of columns)
      grid.dot(x, y, (x + y) % 2 ? hair.base : hair.shade);
  }
  for (const x of [8, 9, 22, 23]) {
    grid.dot(x, 28, hoodie.base);
    grid.dot(x, 29, hair.shade);
  }
};

const puffs: HairStyle = (grid, hair, hoodie) => {
  puff(grid, hair, 7.5, 6, 4.2);
  puff(grid, hair, 23.5, 6, 4.2);
  crown(grid, hair);
  parting(grid, hair);
  for (const [x, y] of [
    [11, 6],
    [11, 7],
    [20, 6],
    [20, 7],
  ] as const)
    grid.dot(x, y, hoodie.base);
  sideburns(grid, hair.shade, 11, 12);
};

const ponytail: HairStyle = (grid, hair, hoodie) => {
  // The tail rises from the back of the head and falls to the right.
  for (let y = 2; y <= 15; y++) {
    for (let x = 22; x <= 28; x++) {
      if (((x - 25) / 2.6) ** 2 + ((y - 8.5) / 6.4) ** 2 < 1)
        grid.dot(x, y, x >= 26 ? hair.shade : hair.base);
    }
  }
  crown(grid, hair);
  for (const [x, y] of [
    [21, 5],
    [22, 5],
    [22, 6],
  ] as const)
    grid.dot(x, y, hoodie.base);
  sideburns(grid, hair.shade, 11, 13);
  streak(grid, hair.light, [
    [12, 7],
    [13, 6],
    [14, 5],
  ]);
};

const bob: HairStyle = (grid, hair) => {
  crown(grid, hair);
  // Blunt bangs to just above the brows, and sides cut straight at the jaw.
  grid.row(10, 9, 22, hairPaint(hair));
  for (let y = 11; y <= 19; y++) {
    grid.row(y, 7, 9, () => hair.base);
    grid.row(y, 22, 24, () => hair.shade);
  }
  streak(grid, hair.light, [
    [11, 8],
    [12, 7],
    [13, 6],
  ]);
};

const capLong: HairStyle = (grid, hair, hoodie) => {
  curtains(grid, hair, 27);
  capCrown(grid, hoodie, "right");
  grid.row(10, 10, 13, () => hair.base);
};

const HAIRSTYLES: HairStyle[] = [
  spiky,
  cap,
  beanie,
  bun,
  afro,
  buzz,
  long,
  spaceBuns,
  braids,
  puffs,
  ponytail,
  bob,
  capLong,
];

/** Lash flicks at the outer corners and a lip tint (DESIGN.md §4.16 details). */
function drawMakeUp(grid: Grid, parts: AvatarParts) {
  if (hasDetail(parts, "lashes")) {
    for (const [x, y] of [
      [10, 12],
      [10, 13],
      [21, 12],
      [21, 13],
    ] as const)
      grid.dot(x, y, INK);
  }
  if (hasDetail(parts, "lips")) {
    grid.row(19, 14, 16, () => LIP);
    grid.dot(17, 18, LIP);
  }
}

/** A small silver hoop under each ear. */
function drawHoops(grid: Grid) {
  for (const cx of [8, 23]) {
    grid.dot(cx, 16, SILVER[0]!);
    grid.dot(cx - 1, 17, SILVER[0]!);
    grid.dot(cx + 1, 17, SILVER[1]!);
    grid.dot(cx, 18, SILVER[1]!);
  }
}

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
