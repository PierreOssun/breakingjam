import { resultOf } from "../../../src/features/jams/result";

describe("resultOf", () => {
  it("prefers the exact placement for the podium", () => {
    expect(resultOf(1, "winner")).toEqual({ kind: "podium", rank: 1 });
    expect(resultOf(null, "top2")).toEqual({ kind: "podium", rank: 2 });
    expect(resultOf(3, "top4")).toEqual({ kind: "podium", rank: 3 });
  });

  it("falls back to the stage reached", () => {
    expect(resultOf(4, "top4")).toEqual({ kind: "top", top: 4 });
    expect(resultOf(null, "top8")).toEqual({ kind: "top", top: 8 });
    expect(resultOf(null, "prelims")).toEqual({ kind: "prelims" });
  });

  it("shows nothing when unknown", () => {
    expect(resultOf(null, "na")).toBeNull();
    expect(resultOf(undefined, undefined)).toBeNull();
  });
});
