import type { Schemas } from "../../api/client";
import { youtubeId } from "../../lib/youtube";

type Round = Schemas["MatchRound"];
type Side = "a" | "b";

/** One battle of the bracket as the Results step edits it: entry ids, "" for none yet. */
export type Slot = {
  a: string;
  b: string;
  winner: Side | null;
  video: string;
  /** The start kept from the curated data; dropped once the link changes. */
  offset: number | null;
};

export type Draft = Partial<Record<Round, Slot[]>>;

/** A battle's place in the draft: its round, and its index in the round. */
type At = { round: Round; index: number };

// The rounds a bracket plays, from its first; each one's winners go on to the next.
const BRACKET: Round[] = ["top64", "top32", "top16", "top8", "top4", "final"];
const FIRST: Record<number, Round> = {
  64: "top64",
  32: "top32",
  16: "top16",
  8: "top8",
  4: "top4",
  2: "final",
};
/** Battles a round holds. */
const CAPACITY: Record<Round, number> = {
  top64: 32,
  top32: 16,
  top16: 8,
  top8: 4,
  top4: 2,
  third: 1,
  final: 1,
};

const emptySlot = (): Slot => ({
  a: "",
  b: "",
  winner: null,
  video: "",
  offset: null,
});

/** The rounds of a bracket of `size`, then the small final when it has semi-finals. */
export function roundsOf(size: number | null | undefined): Round[] {
  const first = size == null ? undefined : FIRST[size];
  if (!first) return [];
  const rounds = BRACKET.slice(BRACKET.indexOf(first));
  return rounds.includes("top4") ? [...rounds, "third"] : rounds;
}

/** Where the Results step opens: the smallest round that seats every entrant (Top 4 for four
 * teams in a Top 8), else the bracket's first. */
export function firstRoundFor(
  rounds: Round[],
  entrants: number,
): Round | undefined {
  const seats = rounds.filter(
    (r) => r !== "third" && CAPACITY[r] * 2 >= entrants,
  );
  return seats.at(-1) ?? rounds[0];
}

/** Every battle of the round has both sides and a winner. */
export function roundDone(slots: Slot[] = []): boolean {
  return slots.length > 0 && slots.every((s) => s.a && s.b && s.winner);
}

/** The battle's stored matches as slots, each at its place in its round; the rest empty. */
export function draftOf(rounds: Round[], matches: Schemas["Match"][]): Draft {
  return Object.fromEntries(
    rounds.map((round) => {
      const slots = Array.from({ length: CAPACITY[round] }, emptySlot);
      for (const m of matches) {
        if (m.round !== round || !slots[m.position]) continue;
        slots[m.position] = {
          a: m.winner_id,
          b: m.loser_id,
          winner: "a",
          video: m.video_url ?? "",
          offset: m.video_offset_seconds ?? null,
        };
      }
      return [round, slots];
    }),
  );
}

const other = (side: Side): Side => (side === "a" ? "b" : "a");
const winnerOf = (slot: Slot) => (slot.winner ? slot[slot.winner] : "");
const loserOf = (slot: Slot) => (slot.winner ? slot[other(slot.winner)] : "");

/**
 * The draft with slot `index` of `round` changed by `change`, and the bracket after it following:
 * a new winner takes their side of the next round's battle (`index / 2`, top or bottom), and a
 * semi-final's new loser theirs in the small final.
 */
export function withSlot(
  draft: Draft,
  round: Round,
  index: number,
  change: Partial<Slot>,
): Draft {
  const next = structuredClone(draft);
  const slots = next[round];
  const slot = slots?.[index];
  if (!slots || !slot) return draft;
  const changed = { ...slot, ...change };
  // Another link, another start: the stored one belonged to the old video.
  if (change.video !== undefined && change.video !== slot.video)
    changed.offset = change.offset ?? null;
  slots[index] = changed;
  follow(next, { round, index }, slot);
  return next;
}

/** Moves the battle at `at`'s winner and (from a semi-final) loser on, if they changed since `before`. */
function follow(draft: Draft, at: At, before: Slot) {
  const slot = draft[at.round]?.[at.index];
  if (!slot) return;
  const side: Side = at.index % 2 === 0 ? "a" : "b";
  // The small final leads nowhere; the draft holds only the rounds the bracket plays.
  const later =
    at.round === "third" ? undefined : BRACKET[BRACKET.indexOf(at.round) + 1];
  const into = { index: Math.floor(at.index / 2), side };
  if (later && winnerOf(slot) !== winnerOf(before)) {
    place(draft, { round: later, ...into }, winnerOf(slot));
  }
  if (at.round === "top4" && loserOf(slot) !== loserOf(before)) {
    place(draft, { round: "third", ...into }, loserOf(slot));
  }
}

/**
 * Puts entry `id` on `side` of the battle at `at`. Someone else battling there, its crown no
 * longer holds: it goes, and whoever it had moved on leaves the rounds after.
 */
function place(draft: Draft, at: At & { side: Side }, id: string) {
  const target = draft[at.round]?.[at.index];
  if (!target || target[at.side] === id) return;
  const before = { ...target };
  target[at.side] = id;
  target.winner = null;
  follow(draft, at, before);
}

/**
 * The video a slot just decided takes from its entries, when it has none: an entry kept the
 * video of its last battle, which is this one for the loser, and in the finals for both.
 */
export function entryVideo(
  round: Round,
  slot: Slot,
  entries: Schemas["Entry"][],
): Partial<Slot> {
  if (!slot.winner || slot.video) return {};
  const sides =
    round === "final" || round === "third"
      ? [other(slot.winner), slot.winner]
      : [other(slot.winner)];
  const entry = sides
    .map((side) => entries.find((e) => e.id === slot[side]))
    .find((e) => e?.video_url);
  return entry?.video_url
    ? { video: entry.video_url, offset: entry.video_offset_seconds ?? null }
    : {};
}

/** True when the slot's link is typed but no YouTube link: the API would refuse it. */
export function badLink(slot: Slot): boolean {
  const video = slot.video.trim();
  return video !== "" && youtubeId(video) === null;
}

/**
 * The body of `PUT /battles/{id}/matches`: every slot with both sides and a winner, at its
 * place. A bad link is held back for the one `saved` holds there, so it never stops the rest.
 */
export function matchesBody(
  rounds: Round[],
  draft: Draft,
  saved: Draft = {},
): Schemas["MatchInput"][] {
  return rounds.flatMap((round) =>
    (draft[round] ?? []).flatMap((slot, position) => {
      if (!slot.a || !slot.b || !slot.winner) return [];
      const kept = saved[round]?.[position];
      const { video, offset } = badLink(slot)
        ? kept && !badLink(kept)
          ? kept
          : { video: "", offset: null }
        : slot;
      const link = video.trim();
      return [
        {
          round,
          position,
          winner_id: slot[slot.winner],
          loser_id: slot[other(slot.winner)],
          video_url: link || null,
          video_offset_seconds: link ? offset : null,
        },
      ];
    }),
  );
}
