import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

// Reads behind the jam page; a missing or hidden jam is `null`, not an error.

export function useJam(idOrSlug: string) {
  return useQuery({
    queryKey: ["event", idOrSlug],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/events/{id}", {
        params: { path: { id: idOrSlug } },
      });
      if (response.status === 404) return null;
      if (!data)
        throw new Error(`GET /api/events/${idOrSlug}: ${response.status}`);
      return data;
    },
  });
}

export function useBattles(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId, "battles"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/events/{id}/battles", {
        params: { path: { id: eventId } },
      });
      if (!data) throw new Error(`battles: ${response.status}`);
      return data;
    },
  });
}

export function useEntries(battleIds: string[]) {
  return useQueries({
    queries: battleIds.map((id) => ({
      queryKey: ["battle", id, "entries"],
      queryFn: async () => {
        const { data, response } = await api.GET("/api/battles/{id}/entries", {
          params: { path: { id } },
        });
        if (!data) throw new Error(`entries: ${response.status}`);
        return data;
      },
    })),
  });
}

export function useStaff(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId, "staff"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/events/{id}/staff", {
        params: { path: { id: eventId } },
      });
      if (!data) throw new Error(`staff: ${response.status}`);
      return data;
    },
  });
}

/** The caller's own jams, drafts included, a page at a time (`GET /events?mine=true`). */
export function useMyJams() {
  return useInfiniteQuery({
    queryKey: ["events", "mine"],
    queryFn: async ({ pageParam }) => {
      const { data, response } = await api.GET("/api/events", {
        params: { query: { mine: true, cursor: pageParam } },
      });
      if (!data) throw new Error(`my jams: ${response.status}`);
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
