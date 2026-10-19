import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { jamsOf } from "./jams";

/** Every public jam with coordinates, past ones included, by date; pages filter them locally. */
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

/** The visitor's country from their IP (`GET /api/geo`), null when unknown. */
export function useVisitorCountry() {
  return useQuery({
    queryKey: ["geo"],
    queryFn: async () => {
      const { data } = await api.GET("/api/geo");
      return data?.country ?? null;
    },
    staleTime: Infinity,
    // The map waits for it before its first view; without it, the view frames every jam.
    retry: false,
  });
}
