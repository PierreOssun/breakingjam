import type { Schemas } from "../../api/client";

export type ResultKind = "podium" | "top" | "prelims";

/** Badge of a result (DESIGN.md §4.13): `final_rank` 1–3 first, else the stage reached. */
export function resultOf(
  finalRank: number | null | undefined,
  reached: Schemas["BracketStage"] | null | undefined,
): { kind: ResultKind; rank?: 1 | 2 | 3; top?: number } | null {
  if (finalRank === 1 || reached === "winner")
    return { kind: "podium", rank: 1 };
  if (finalRank === 2 || reached === "top2") return { kind: "podium", rank: 2 };
  if (finalRank === 3) return { kind: "podium", rank: 3 };
  const top = reached?.match(/^top(\d+)$/)?.[1];
  if (top) return { kind: "top", top: Number(top) };
  if (reached === "prelims") return { kind: "prelims" };
  return null;
}
