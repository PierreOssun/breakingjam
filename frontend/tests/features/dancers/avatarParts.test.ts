import {
  drawAvatar,
  formatParts,
  hasDetail,
  parseParts,
  partsOf,
  seededParts,
} from "../../../src/features/dancers/avatarParts";

const ID = "01920000-0000-7000-8000-000000000001";

describe("pixel avatar parts", () => {
  it("stores parts as the code the API checks, and reads it back", () => {
    const parts = {
      hair: 2,
      skin: 1,
      hairColour: 0,
      hoodie: 3,
      extra: 0,
      backdrop: 1,
      details: 0,
    };
    // Without details the code is the six-part one stored before them.
    expect(formatParts(parts)).toBe("h2-s1-c0-o3-e0-b1");
    expect(parseParts("h2-s1-c0-o3-e0-b1")).toEqual(parts);
    const braids = { ...parts, hair: 8, details: 5 };
    expect(formatParts(braids)).toBe("h8-s1-c0-o3-e0-b1-d5");
    expect(parseParts("h8-s1-c0-o3-e0-b1-d5")).toEqual(braids);
    expect(hasDetail(braids, "lashes")).toBe(true);
    expect(hasDetail(braids, "lips")).toBe(false);
    expect(hasDetail(braids, "hoops")).toBe(true);
    for (const bad of [
      "",
      "h13-s1-c0-o3-e0-b1",
      "s1-h2-c0-o3-e0-b1",
      "h2-s1",
      "h2-s1-c0-o3-e0-b1-d8",
      "h2-s1-c0-o3-e0-b1-x1",
    ]) {
      expect(parseParts(bad)).toBeNull();
    }
  });

  it("seeds the same face for the same id, and uses a choice when there is one", () => {
    expect(seededParts(ID)).toEqual(seededParts(ID));
    expect(partsOf({ id: ID })).toEqual(seededParts(ID));
    expect(partsOf({ id: ID, avatar_parts: "h12-s3-c4-o4-e2-b3-d7" })).toEqual({
      hair: 12,
      skin: 3,
      hairColour: 4,
      hoodie: 4,
      extra: 2,
      backdrop: 3,
      details: 7,
    });
  });

  it("seeds every hair style and each detail about one time in three", () => {
    const seeded = Array.from({ length: 3000 }, (_, i) =>
      seededParts(`d-${i}`),
    );
    expect(new Set(seeded.map((p) => p.hair)).size).toBe(13);
    for (const name of ["lashes", "lips", "hoops"] as const) {
      const share = seeded.filter((p) => hasDetail(p, name)).length / 3000;
      expect(share).toBeGreaterThan(0.28);
      expect(share).toBeLessThan(0.39);
    }
  });

  it("never seeds a hoodie the colour of its backdrop", () => {
    // Klein, violet, ink and night backdrops swallow these hoodies.
    const clashes = [1, 2, 0, 0];
    for (let i = 0; i < 500; i++) {
      const parts = seededParts(`dancer-${i}`);
      expect(parts.hoodie).not.toBe(clashes[parts.backdrop]);
    }
  });

  it("draws a 32×32 bust with an ink outline", () => {
    const grid = drawAvatar(seededParts(ID));
    expect(grid).toHaveLength(32);
    expect(grid.every((row) => row.length === 32)).toBe(true);
    // Between the backdrop at the far left and the face, the silhouette is outlined.
    expect(grid[14]!.slice(0, 12)).toContain("#0B0D14");
    // Every hair style and every detail changes the drawing.
    const plain = { ...seededParts(ID), details: 0 };
    const drawings = Array.from({ length: 13 }, (_, hair) =>
      JSON.stringify(drawAvatar({ ...plain, hair })),
    );
    expect(new Set(drawings).size).toBe(13);
    for (const details of [1, 2, 4]) {
      expect(drawAvatar({ ...plain, details })).not.toEqual(drawAvatar(plain));
    }
  });
});
