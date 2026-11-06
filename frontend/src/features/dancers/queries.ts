import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** A dancer page, or where a merged one went; null when there is no such dancer. */
export function useDancer(id: string) {
  return useQuery({
    queryKey: ["dancer", id],
    queryFn: async () => {
      const reply = await api.GET("/api/dancers/{id}", {
        params: { path: { id } },
      });
      if (reply.response.status === 404) return null;
      return unwrap(reply, "dancer");
    },
  });
}

/** A curated dancer's page by its key in `data/dancers.toml`, the same in every environment;
 * null when no dancer has the key here, or without a key. */
export function useDancerByKey(key: string | null) {
  return useQuery({
    queryKey: ["dancer", "key", key],
    queryFn: async () => {
      const reply = await api.GET("/api/dancers/by-key/{key}", {
        params: { path: { key: key ?? "" } },
      });
      if (reply.response.status === 404) return null;
      return unwrap(reply, "dancer");
    },
    enabled: key !== null,
  });
}

/** The dancer's jams, upcoming and past. */
export function useDancerEvents(id: string) {
  return useQuery({
    queryKey: ["dancer", id, "events"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/dancers/{id}/events", { params: { path: { id } } }),
        "dancer events",
      ),
  });
}
