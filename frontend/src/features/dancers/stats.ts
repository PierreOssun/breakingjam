import type { Schemas } from "../../api/client";
import { resultOf } from "../jams/result";
import { yearOf } from "../../lib/dates";

export type DancerStats = {
  jams: number;
  countries: number;
  years: number;
  podiums: number;
};

/**
 * The stats strip (DESIGN.md §4.15), from jams that already happened: a record, not plans.
 * Years active counts the distinct years with at least one jam.
 */
export function statsOf(past: Schemas["Participation"][]): DancerStats {
  return {
    jams: new Set(past.map((p) => p.event.id)).size,
    countries: new Set(past.map((p) => p.event.country)).size,
    years: new Set(past.map((p) => yearOf(p.event.starts_on))).size,
    podiums: past.filter(
      (p) => resultOf(p.final_rank, p.reached)?.kind === "podium",
    ).length,
  };
}
