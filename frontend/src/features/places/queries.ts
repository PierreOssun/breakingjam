import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** The city a search names (`GET /api/places`), null when none does; no lookup for a blank search. */
export function usePlace(q: string) {
  return useQuery({
    queryKey: ["place", q],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/places", { params: { query: { q } } }),
        "place",
      ).place ?? null,
    enabled: q !== "",
    // Cities don't move.
    staleTime: Infinity,
  });
}
