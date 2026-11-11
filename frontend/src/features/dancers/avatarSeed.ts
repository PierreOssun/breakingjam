// The avatar of a dancer who hasn't chosen one (DESIGN.md §4.16): drawn from their id, from
// the parts there were before the builder, so nobody's face changed when it arrived.

import { AVATAR_OPTIONS, type AvatarSpec, avatarSpec } from "./avatar";

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

// Hair and what is worn on it: a cap or a beanie sits on a buzz cut, the backwards cap on long hair.
const HAIR: Pick<AvatarSpec, "style" | "head">[] = [
  { style: "spiky", head: "none" },
  { style: "buzz", head: "cap" },
  { style: "buzz", head: "beanie" },
  { style: "bun", head: "none" },
  { style: "afro", head: "none" },
  { style: "buzz", head: "none" },
  { style: "long", head: "none" },
  { style: "space", head: "none" },
  { style: "braids", head: "none" },
  { style: "puffs", head: "none" },
  { style: "pony", head: "none" },
  { style: "bangs", head: "none" },
  { style: "long", head: "cap" },
];
const SKINS = ["light", "tan", "medium", "deep"] as const;
const HAIR_COLOURS = ["black", "brown", "bleach", "violet", "blue"] as const;
// A hoodie, and the accent of what is worn with it: its own colour.
const HOODIES: Pick<AvatarSpec, "cloth" | "accent">[] = [
  { cloth: "ink", accent: "black" },
  { cloth: "blue", accent: "blue" },
  { cloth: "violet", accent: "violet" },
  { cloth: "white", accent: "white" },
  { cloth: "red", accent: "red" },
];
const EXTRAS = ["none", "phones", "chain"] as const;
const STAGES = ["klein", "violet", "ink", "night"] as const;
// The hoodie each stage would swallow: blue, violet, ink, ink (night).
const CLASHES = [1, 2, 0, 0];

/** The avatar drawn from a dancer's id: the same id always draws the same face. */
export function seededAvatar(id: string): AvatarSpec {
  let h = hash(id);
  const pick = (n: number) => {
    const value = h % n;
    h = Math.floor(h / n);
    return value;
  };
  // Every style is equally likely and no part is tied to a gender; each detail is on one
  // time in three. The picks keep their order: it is what ties a face to its id.
  const hair = HAIR[pick(HAIR.length)]!;
  const skin = SKINS[pick(4)]!;
  const colour = HAIR_COLOURS[pick(5)]!;
  const hoodie = pick(5);
  const extra = EXTRAS[pick(3)]!;
  const stage = pick(4);
  const [lashes, lips, hoops] = [pick(3) === 0, pick(3) === 0, pick(3) === 0];
  return avatarSpec({
    ...hair,
    skin,
    hair: colour,
    // A hoodie the colour of its stage disappears; the next one never clashes.
    ...HOODIES[CLASHES[stage] === hoodie ? hoodie + 1 : hoodie],
    extra,
    bg: STAGES[stage],
    lashes,
    lips,
    hoops,
  });
}

/**
 * A stored spec with every slot this build can draw; one it doesn't know (a tab open since
 * before a release added it) falls back to its default rather than breaking the page.
 */
function knownAvatar(stored: Record<string, unknown>): AvatarSpec {
  const options: Record<string, readonly unknown[]> = AVATAR_OPTIONS;
  const known = Object.entries(stored).filter(([slot, value]) =>
    options[slot] ? options[slot].includes(value) : typeof value === "boolean",
  );
  return avatarSpec(Object.fromEntries(known));
}

/** The avatar a dancer is drawn with: the one chosen for them, else the seed's. */
export function avatarOf(dancer: {
  id: string;
  avatar?: object | null;
}): AvatarSpec {
  return dancer.avatar
    ? knownAvatar(dancer.avatar as Record<string, unknown>)
    : seededAvatar(dancer.id);
}
