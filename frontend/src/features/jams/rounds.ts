import type { Schemas } from "../../api/client";

type Entry = Schemas["Entry"];

/** One battle of the bracket, winner first, with its video when there is one. */
export type Pairing = {
  id: string;
  winner: Entry;
  loser: Entry;
  video: { url: string; offset: number | null } | null;
};

/** A round of the results, or the placings that stand for one when its pairings are unknown. */
export type Section = {
  /** A bracket round, else `prelims`, or `entered` for entries with no result yet. */
  key: Schemas["MatchRound"] | "prelims" | "entered";
  pairings: Pairing[];
  /** Entries placed in this round but in none of its known pairings: shown as plain rows. */
  placed: Entry[];
};

export type Results = { final: Pairing | null; sections: Section[] };

// After the final, the order a visitor reads the bracket in: the small final, then backwards.
const ORDER: Section["key"][] = [
  "final",
  "third",
  "top4",
  "top8",
  "top16",
  "top32",
  "top64",
  "prelims",
  "entered",
];

/** The placings an entry left in each section: a round's losers, or the finalists without a final. */
const STAGES: Record<Section["key"], Schemas["BracketStage"][]> = {
  final: ["winner", "top2"],
  third: [],
  top4: ["top4"],
  top8: ["top8"],
  top16: ["top16"],
  top32: ["top32"],
  top64: ["top64"],
  prelims: ["prelims"],
  entered: ["na"],
};

/**
 * A battle's results by round (DESIGN.md §6 Battle results): the final (from 1st and 2nd when
 * no final is stored), then each round's pairings, falling back to the placings for the rounds
 * whose pairings are unknown. Null when there is no result yet, so the entrants show as before.
 */
export function resultsOf(
  battle: Pick<Schemas["BattleDetail"], "entries" | "matches">,
): Results | null {
  const active = battle.entries.filter((e) => e.status !== "withdrawn");
  const byId = new Map(active.map((e) => [e.id, e]));
  const pairings = battle.matches.flatMap((m) => {
    const [winner, loser] = [byId.get(m.winner_id), byId.get(m.loser_id)];
    if (!winner || !loser) return [];
    const video = m.video_url
      ? { url: m.video_url, offset: m.video_offset_seconds ?? null }
      : null;
    return [{ round: m.round, pairing: { id: m.id, winner, loser, video } }];
  });
  if (pairings.length === 0 && active.every((e) => e.reached === "na")) {
    return null;
  }

  const final =
    pairings.find((p) => p.round === "final")?.pairing ?? finalOf(active);
  const sections = ORDER.flatMap((key): Section[] => {
    // The final has a card of its own once it is known.
    if (key === "final" && final) return [];
    const inRound = pairings
      .filter((p) => p.round === key)
      .map((p) => p.pairing);
    const seen = new Set(inRound.flatMap((p) => [p.winner.id, p.loser.id]));
    const placed = active.filter(
      (e) => STAGES[key].includes(e.reached) && !seen.has(e.id),
    );
    return inRound.length + placed.length > 0
      ? [{ key, pairings: inRound, placed }]
      : [];
  });
  return { final, sections };
}

/** The final told by the placings alone: the one 1st against the one 2nd, with the winner's
 * video, since the final was their last battle. Null unless both are known. */
function finalOf(active: Entry[]): Pairing | null {
  const [winner, ...moreWinners] = active.filter((e) => e.reached === "winner");
  const [loser, ...moreLosers] = active.filter((e) => e.reached === "top2");
  if (!winner || !loser || moreWinners.length > 0 || moreLosers.length > 0) {
    return null;
  }
  const url = winner.video_url ?? loser.video_url;
  const offset = winner.video_url
    ? winner.video_offset_seconds
    : loser.video_offset_seconds;
  return {
    id: `final-${winner.id}`,
    winner,
    loser,
    video: url ? { url, offset: offset ?? null } : null,
  };
}

/** Rounds below the quarter-finals, folded on phones behind "Show the N battles". */
export function foldsOnPhones(key: Section["key"]): boolean {
  return key === "top16" || key === "top32" || key === "top64";
}
