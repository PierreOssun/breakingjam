import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { jamsOf } from "./jams";

/** Every upcoming public jam with coordinates, soonest first; the map filters them locally. */
export function useMapJams() {
  return useQuery({
    queryKey: ["events", "geojson"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/events.geojson");
      if (!data) throw new Error(`events.geojson: ${response.status}`);
      return jamsOf(data);
    },
    staleTime: 60_000,
  });
}
