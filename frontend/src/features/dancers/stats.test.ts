import type { Schemas } from "../../api/client";
import { statsOf } from "./stats";

function past(
  id: string,
  country: string,
  startsOn: string,
  finalRank: number | null,
): Schemas["Participation"] {
  return {
    event: {
      id,
      name: id,
      slug: id,
      starts_on: startsOn,
      ends_on: startsOn,
      city: "X",
      country,
      status: "completed",
    },
    role: "competitor",
    final_rank: finalRank,
    reached: "na",
  };
}

describe("statsOf", () => {
  it("counts distinct jams, countries and years, and podium finishes", () => {
    const stats = statsOf([
      past("a", "FR", "2024-05-01", 1),
      past("a", "FR", "2024-05-01", null), // judged the same jam
      past("b", "DE", "2025-03-01", 4),
      past("c", "FR", "2025-09-01", 3),
    ]);
    expect(stats).toEqual({ jams: 3, countries: 2, years: 2, podiums: 2 });
  });

  it("is all zero without past jams", () => {
    expect(statsOf([])).toEqual({
      jams: 0,
      countries: 0,
      years: 0,
      podiums: 0,
    });
  });
});
