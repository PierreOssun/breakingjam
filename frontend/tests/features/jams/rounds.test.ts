import type { Schemas } from "../../../src/api/client";
import { foldsOnPhones, resultsOf } from "../../../src/features/jams/rounds";

type Entry = Schemas["Entry"];
type Match = Schemas["Match"];

const at = "2026-10-01T10:00:00Z";
const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  battle_id: "b1",
  status: "confirmed",
  reached: "na",
  members: [],
  team_name: id,
  created_at: at,
  updated_at: at,
  ...extra,
});
const match = (
  id: string,
  round: Match["round"],
  winner: string,
  loser: string,
  video_url: string | null = null,
): Match => ({
  id,
  round,
  position: Number(id.slice(1)),
  winner_id: winner,
  loser_id: loser,
  video_url,
});

// A Top 8: the full bracket, as the curated data gives it.
const ENTRIES = [
  entry("a", { reached: "winner", final_rank: 1 }),
  entry("b", { reached: "top2", final_rank: 2 }),
  entry("c", { reached: "top4" }),
  entry("d", { reached: "top4" }),
  entry("e", { reached: "top8" }),
  entry("f", { reached: "top8" }),
  entry("g", { reached: "top8" }),
  entry("h", { reached: "top8" }),
];
const BRACKET = [
  match("m1", "top8", "a", "e"),
  match("m2", "top8", "c", "f"),
  match("m3", "top8", "b", "g"),
  match("m4", "top8", "d", "h"),
  match("m5", "top4", "a", "c"),
  match("m6", "top4", "b", "d"),
  match("m7", "final", "a", "b", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
];

const names = (entries: Entry[]) => entries.map((e) => e.id);

describe("resultsOf", () => {
  it("has nothing while no entry has a result", () => {
    expect(resultsOf({ entries: [entry("a"), entry("b")], matches: [] })).toBe(
      null,
    );
  });

  it("puts the final first, then each round backwards, the winner first in every pairing", () => {
    const results = resultsOf({ entries: ENTRIES, matches: BRACKET });
    expect(results?.final?.winner.id).toBe("a");
    expect(results?.final?.loser.id).toBe("b");
    expect(results?.final?.video?.url).toContain("dQw4w9WgXcQ");
    expect(results?.sections.map((s) => s.key)).toEqual(["top4", "top8"]);
    const [semis, quarters] = results?.sections ?? [];
    expect(semis?.pairings.map((p) => [p.winner.id, p.loser.id])).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
    expect(quarters?.pairings).toHaveLength(4);
    // Every placing is told by a pairing: no chips.
    expect(results?.sections.flatMap((s) => s.placed)).toEqual([]);
    expect(semis?.pairings.every((p) => p.video === null)).toBe(true);
  });

  it("falls back to the placings, grouped by round, where pairings are unknown", () => {
    // Only the final is known, as the migration made it from 1st and 2nd.
    const results = resultsOf({
      entries: ENTRIES,
      matches: [match("m7", "final", "a", "b")],
    });
    expect(results?.final?.winner.id).toBe("a");
    expect(
      results?.sections.map((s) => [s.key, s.pairings.length, names(s.placed)]),
    ).toEqual([
      ["top4", 0, ["c", "d"]],
      ["top8", 0, ["e", "f", "g", "h"]],
    ]);
  });

  it("makes the final from 1st and 2nd when no final is stored, with the winner's video", () => {
    const results = resultsOf({
      entries: ENTRIES.map((e) =>
        e.id === "a"
          ? { ...e, video_url: "https://youtu.be/x", video_offset_seconds: 30 }
          : e,
      ),
      matches: [],
    });
    expect(results?.final).toMatchObject({
      winner: { id: "a" },
      loser: { id: "b" },
      video: { url: "https://youtu.be/x", offset: 30 },
    });
    expect(results?.sections.map((s) => s.key)).toEqual(["top4", "top8"]);
  });

  it("shows the finalists as placings when 1st and 2nd don't make one final", () => {
    const results = resultsOf({
      entries: [...ENTRIES, entry("z", { reached: "top2" })],
      matches: [],
    });
    expect(results?.final).toBe(null);
    expect(names(results?.sections[0]?.placed ?? [])).toEqual(["a", "b", "z"]);
    expect(results?.sections[0]?.key).toBe("final");
  });

  it("leaves out withdrawn entries and the pairings they were in", () => {
    const results = resultsOf({
      entries: [
        entry("a", { reached: "winner", final_rank: 1 }),
        entry("b", { reached: "top2", status: "withdrawn" }),
        entry("c", { reached: "prelims" }),
      ],
      matches: [match("m1", "final", "a", "b")],
    });
    expect(results?.final).toBe(null);
    expect(results?.sections.map((s) => [s.key, names(s.placed)])).toEqual([
      ["final", ["a"]],
      ["prelims", ["c"]],
    ]);
  });
});

describe("foldsOnPhones", () => {
  it("folds the rounds below the quarter-finals", () => {
    expect(["top4", "top8"].map((k) => foldsOnPhones(k as "top4"))).toEqual([
      false,
      false,
    ]);
    expect(foldsOnPhones("top16")).toBe(true);
    expect(foldsOnPhones("top32")).toBe(true);
  });
});
