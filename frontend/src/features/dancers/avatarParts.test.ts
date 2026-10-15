import {
  drawAvatar,
  formatParts,
  parseParts,
  partsOf,
  seededParts,
} from "./avatarParts";

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
    };
    expect(formatParts(parts)).toBe("h2-s1-c0-o3-e0-b1");
    expect(parseParts("h2-s1-c0-o3-e0-b1")).toEqual(parts);
    for (const bad of ["", "h9-s1-c0-o3-e0-b1", "s1-h2-c0-o3-e0-b1", "h2-s1"]) {
      expect(parseParts(bad)).toBeNull();
    }
  });

  it("seeds the same face for the same id, and uses a choice when there is one", () => {
    expect(seededParts(ID)).toEqual(seededParts(ID));
    expect(partsOf({ id: ID })).toEqual(seededParts(ID));
    expect(partsOf({ id: ID, avatar_parts: "h5-s3-c4-o4-e2-b3" })).toEqual({
      hair: 5,
      skin: 3,
      hairColour: 4,
      hoodie: 4,
      extra: 2,
      backdrop: 3,
    });
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
    expect(drawAvatar({ ...seededParts(ID), hair: 4 })).not.toEqual(
      drawAvatar({ ...seededParts(ID), hair: 5 }),
    );
  });
});
