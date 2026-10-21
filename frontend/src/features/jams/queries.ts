import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

// Reads behind the jam page; a missing or hidden jam is `null`, not an error.

export function useJam(idOrSlug: string) {
  return useQuery({
    queryKey: ["event", idOrSlug],
    queryFn: async () => {
      const reply = await api.GET("/api/events/{id}", {
        params: { path: { id: idOrSlug } },
      });
      if (reply.response.status === 404) return null;
      return unwrap(reply, "event");
    },
  });
}

export function useBattles(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId, "battles"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/events/{id}/battles", {
          params: { path: { id: eventId } },
        }),
        "battles",
      ),
  });
}

export function useEntries(battleIds: string[]) {
  return useQueries({
    queries: battleIds.map((id) => ({
      queryKey: ["battle", id, "entries"],
      queryFn: async () =>
        unwrap(
          await api.GET("/api/battles/{id}/entries", {
            params: { path: { id } },
          }),
          "entries",
        ),
    })),
  });
}

export function useStaff(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId, "staff"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/events/{id}/staff", {
          params: { path: { id: eventId } },
        }),
        "staff",
      ),
  });
}

/** The caller's own jams, drafts included, a page at a time (`GET /events?mine=true`). */
export function useMyJams() {
  return useInfiniteQuery({
    queryKey: ["events", "mine"],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/api/events", {
          params: { query: { mine: true, cursor: pageParam } },
        }),
        "my jams",
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
