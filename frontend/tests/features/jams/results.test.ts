import type { Schemas } from "../../../src/api/client";
import {
  badLink,
  draftOf,
  entryVideo,
  firstRoundFor,
  matchesBody,
  roundDone,
  roundsOf,
  withSlot,
} from "../../../src/features/jams/results";

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("roundsOf", () => {
  it("plays every round from the bracket's first, then the small final", () => {
    expect(roundsOf(8)).toEqual(["top8", "top4", "final", "third"]);
    expect(roundsOf(2)).toEqual(["final"]);
  });

  it("has no rounds without a bracket size", () => {
    expect(roundsOf(null)).toEqual([]);
    expect(roundsOf(6)).toEqual([]);
  });
});

describe("firstRoundFor", () => {
  it("opens on the smallest round that seats every entrant", () => {
    const top8 = roundsOf(8);
    expect(firstRoundFor(top8, 8)).toBe("top8");
    expect(firstRoundFor(top8, 4)).toBe("top4");
    expect(firstRoundFor(top8, 3)).toBe("top4");
    expect(firstRoundFor(top8, 2)).toBe("final");
    // More than the bracket holds: prelims came first, the bracket starts at its top.
    expect(firstRoundFor(top8, 12)).toBe("top8");
    expect(firstRoundFor([], 4)).toBeUndefined();
  });
});

describe("roundDone", () => {
  const won = {
    a: "e1",
    b: "e2",
    winner: "a" as const,
    video: "",
    offset: null,
  };
  it("ticks a round once each of its battles has both sides and a winner", () => {
    expect(roundDone([won, won])).toBe(true);
    expect(roundDone([won, { ...won, winner: null }])).toBe(false);
    expect(roundDone([won, { ...won, b: "" }])).toBe(false);
    expect(roundDone([])).toBe(false);
    expect(roundDone(undefined)).toBe(false);
  });
});

describe("draftOf", () => {
  it("puts each stored match at its place in its round, winner on top, the rest empty", () => {
    const draft = draftOf(roundsOf(4), [
      {
        id: "m1",
        round: "top4",
        position: 1,
        winner_id: "a",
        loser_id: "b",
        video_url: VIDEO,
        video_offset_seconds: 90,
      },
    ]);
    // Battle 2 entered before battle 1 stays battle 2.
    expect(draft.top4).toEqual([
      { a: "", b: "", winner: null, video: "", offset: null },
      { a: "a", b: "b", winner: "a", video: VIDEO, offset: 90 },
    ]);
    expect(draft.final).toHaveLength(1);
    expect(draft.third).toHaveLength(1);
  });
});

describe("withSlot", () => {
  const rounds = roundsOf(4);
  const start = draftOf(rounds, []);

  it("moves a semi-final's winner to the final and its loser to the small final", () => {
    let draft = withSlot(start, "top4", 0, { a: "a", b: "b" });
    draft = withSlot(draft, "top4", 1, { a: "c", b: "d" });
    draft = withSlot(draft, "top4", 0, { winner: "b" });
    draft = withSlot(draft, "top4", 1, { winner: "a" });
    expect(draft.final?.[0]).toMatchObject({ a: "b", b: "c" });
    expect(draft.third?.[0]).toMatchObject({ a: "a", b: "d" });
    // The draft it came from is left as it was.
    expect(start.final?.[0]?.a).toBe("");
  });

  it("fills the next round from the winners, top or bottom by battle", () => {
    let draft = draftOf(roundsOf(8), []);
    const pairs = [
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
      ["g", "h"],
    ] as const;
    pairs.forEach(([a, b], i) => {
      draft = withSlot(draft, "top8", i, { a, b, winner: i % 2 ? "b" : "a" });
    });
    expect(draft.top4?.map((slot) => [slot.a, slot.b])).toEqual([
      ["a", "d"],
      ["e", "h"],
    ]);
    // Another winner takes their place.
    draft = withSlot(draft, "top8", 1, { winner: "a" });
    expect(draft.top4?.[0]).toMatchObject({ a: "a", b: "c" });
  });

  it("follows a corrected winner through the rounds after, uncrowning what no longer holds", () => {
    let draft = draftOf(roundsOf(8), []);
    draft = withSlot(draft, "top8", 0, { a: "a", b: "b", winner: "a" });
    draft = withSlot(draft, "top8", 1, { a: "c", b: "d", winner: "a" });
    draft = withSlot(draft, "top4", 0, { winner: "a" }); // a beats c
    draft = withSlot(draft, "top4", 1, { a: "e", b: "f", winner: "a" });
    draft = withSlot(draft, "final", 0, { winner: "a" }); // a beats e
    expect(draft.final?.[0]).toMatchObject({ a: "a", b: "e", winner: "a" });

    // b won the first battle after all.
    draft = withSlot(draft, "top8", 0, { winner: "b" });
    // b vs c is a battle nobody entered: no crown, and a leaves the rounds after.
    expect(draft.top4?.[0]).toMatchObject({ a: "b", b: "c", winner: null });
    expect(draft.final?.[0]).toMatchObject({ a: "", b: "e", winner: null });
    expect(draft.third?.[0]).toMatchObject({ a: "", b: "f" });
    expect(matchesBody(roundsOf(8), draft).map((m) => m.round)).toEqual([
      "top8",
      "top8",
      "top4",
    ]);
  });

  it("puts a corrected winner in the seat the old one had, in a bracket loaded from the API", () => {
    const stored = (
      round: Schemas["MatchRound"],
      position: number,
      winner_id: string,
      loser_id: string,
    ): Schemas["Match"] => ({
      id: `${round}-${position}`,
      round,
      position,
      winner_id,
      loser_id,
      video_url: null,
      video_offset_seconds: null,
    });
    // c, who came from the second battle, won the semi-final: stored winner first, on top.
    let draft = draftOf(roundsOf(8), [
      stored("top8", 0, "a", "b"),
      stored("top8", 1, "c", "d"),
      stored("top4", 0, "c", "a"),
    ]);
    expect(draft.top4?.[0]).toMatchObject({ a: "c", b: "a", winner: "a" });

    // b won the first battle after all: b takes a's seat, and c stays.
    draft = withSlot(draft, "top8", 0, { winner: "b" });
    expect(draft.top4?.[0]).toMatchObject({ a: "c", b: "b", winner: null });
  });

  it("drops a stored start once the video link changes", () => {
    const stored = draftOf(rounds, [
      {
        id: "m1",
        round: "final",
        position: 0,
        winner_id: "a",
        loser_id: "b",
        video_url: VIDEO,
        video_offset_seconds: 90,
      },
    ]);
    const changed = withSlot(stored, "final", 0, {
      video: "https://youtu.be/abcdefghijk",
    });
    expect(changed.final?.[0]?.offset).toBe(null);
  });
});

describe("entryVideo", () => {
  const entry = (id: string, video_url: string | null) =>
    ({ id, video_url, video_offset_seconds: 42 }) as Schemas["Entry"];
  const entries = [
    entry("a", "https://youtu.be/aaaaaaaaaaa"),
    entry("b", VIDEO),
  ];
  const decided = {
    a: "a",
    b: "b",
    winner: "a" as const,
    video: "",
    offset: null,
  };

  it("moves the loser's video to the battle they lost, with its start", () => {
    expect(entryVideo("top8", decided, entries)).toEqual({
      video: VIDEO,
      offset: 42,
    });
  });

  it("takes the winner's video in the final, their last battle too", () => {
    const entries2 = [entry("a", VIDEO), entry("b", null)];
    expect(entryVideo("final", decided, entries2).video).toBe(VIDEO);
    expect(entryVideo("top8", decided, entries2)).toEqual({});
  });

  it("keeps a link already typed, and waits for a winner", () => {
    expect(entryVideo("top8", { ...decided, video: "x" }, entries)).toEqual({});
    expect(entryVideo("top8", { ...decided, winner: null }, entries)).toEqual(
      {},
    );
  });
});

describe("matchesBody", () => {
  it("keeps each battle's place, skipped ones included", () => {
    const rounds = roundsOf(4);
    const draft = withSlot(draftOf(rounds, []), "top4", 1, {
      a: "c",
      b: "d",
      winner: "a",
    });
    expect(matchesBody(rounds, draft)).toMatchObject([
      { round: "top4", position: 1, winner_id: "c" },
    ]);
  });

  it("holds a bad link back for the saved one, so the rest still saves", () => {
    const rounds = roundsOf(2);
    const saved = draftOf(rounds, [
      {
        id: "m1",
        round: "final",
        position: 0,
        winner_id: "a",
        loser_id: "b",
        video_url: VIDEO,
        video_offset_seconds: 90,
      },
    ]);
    const typed = withSlot(saved, "final", 0, { video: "https://vimeo.com/1" });
    expect(badLink(typed.final![0]!)).toBe(true);
    expect(matchesBody(rounds, typed, saved)[0]).toMatchObject({
      video_url: VIDEO,
      video_offset_seconds: 90,
    });
    // Nothing saved there before: no video rather than a refused bracket.
    expect(matchesBody(rounds, typed)[0]?.video_url).toBe(null);
  });

  it("sends the battles with both sides and a winner, the winner first, in round order", () => {
    const rounds = roundsOf(4);
    let draft = draftOf(rounds, []);
    draft = withSlot(draft, "top4", 0, { a: "a", b: "b", winner: "b" });
    draft = withSlot(draft, "top4", 1, { a: "c", b: "d" });
    draft = withSlot(draft, "final", 0, {
      b: "c",
      winner: "a",
      video: ` ${VIDEO} `,
    });
    expect(matchesBody(rounds, draft)).toEqual([
      {
        round: "top4",
        position: 0,
        winner_id: "b",
        loser_id: "a",
        video_url: null,
        video_offset_seconds: null,
      },
      {
        round: "final",
        position: 0,
        winner_id: "b",
        loser_id: "c",
        video_url: VIDEO,
        video_offset_seconds: null,
      },
    ]);
  });
});
