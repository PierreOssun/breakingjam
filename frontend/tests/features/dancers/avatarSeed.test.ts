import { avatarSpec, renderAvatar } from "../../../src/features/dancers/avatar";
import {
  avatarOf,
  seededAvatar,
} from "../../../src/features/dancers/avatarSeed";

const ID = "01920000-0000-7000-8000-000000000001";

describe("seeded avatar", () => {
  it("draws the faces dancers had before the builder", () => {
    // Taken from the renderer the builder replaced: a change here changes everyone's avatar.
    expect(seededAvatar(ID)).toEqual(
      avatarSpec({
        skin: "deep",
        style: "bun",
        hair: "violet",
        cloth: "red",
        accent: "red",
        bg: "violet",
        lashes: true,
        lips: true,
      }),
    );
    expect(seededAvatar("01920000-0000-7000-8000-0000000000d1")).toEqual(
      avatarSpec({
        skin: "medium",
        style: "long",
        head: "cap",
        hair: "bleach",
        cloth: "white",
        accent: "white",
        extra: "phones",
        bg: "violet",
      }),
    );
    expect(seededAvatar("dancer-7")).toEqual(
      avatarSpec({
        style: "buzz",
        head: "cap",
        hair: "bleach",
        cloth: "red",
        accent: "red",
        extra: "chain",
        bg: "ink",
      }),
    );
  });

  it("uses the chosen avatar when there is one, its missing slots at their default", () => {
    expect(avatarOf({ id: ID })).toEqual(seededAvatar(ID));
    expect(avatarOf({ id: ID, avatar: null })).toEqual(seededAvatar(ID));
    expect(
      avatarOf({ id: ID, avatar: { style: "flame", fx: "aura" } }),
    ).toEqual(avatarSpec({ style: "flame", fx: "aura" }));
  });

  it("draws a stored value it doesn't know at the slot's default", () => {
    // A tab open since before a release added "mullet", or a slot stored as null.
    const stored = { style: "mullet", hair: null, lashes: "yes", fx: "aura" };
    const drawn = avatarOf({ id: ID, avatar: stored });
    expect(drawn).toEqual(avatarSpec({ fx: "aura" }));
    expect(() => renderAvatar(drawn)).not.toThrow();
  });

  it("seeds every former hair and each detail about one time in three", () => {
    const seeded = Array.from({ length: 3000 }, (_, i) =>
      seededAvatar(`d-${i}`),
    );
    expect(new Set(seeded.map((a) => `${a.style} ${a.head}`)).size).toBe(13);
    for (const detail of ["lashes", "lips", "hoops"] as const) {
      const share = seeded.filter((a) => a[detail]).length / 3000;
      expect(share).toBeGreaterThan(0.28);
      expect(share).toBeLessThan(0.39);
    }
    // Each of the 13 draws its own sprite.
    const drawings = new Set(
      seeded.map(({ style, head }) =>
        JSON.stringify(renderAvatar(avatarSpec({ style, head })).sprite),
      ),
    );
    expect(drawings.size).toBe(13);
  });

  it("never seeds a hoodie the colour of its stage", () => {
    const swallowed = {
      klein: "blue",
      violet: "violet",
      ink: "ink",
      night: "ink",
    };
    for (let i = 0; i < 500; i++) {
      const { bg, cloth } = seededAvatar(`dancer-${i}`);
      expect(cloth).not.toBe(swallowed[bg as keyof typeof swallowed]);
    }
  });
});
