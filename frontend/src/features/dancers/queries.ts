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
