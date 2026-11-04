import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { api, type Schemas, unwrap } from "../../api/client";

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

/** Writes the jam a save returned into the page's cache, under its id and its slug, keeping
 * what only the page carries (`can_edit`, `actions`, the organiser). */
export function storeJam(
  queryClient: QueryClient,
  jam: { id: string; slug: string },
  event: Schemas["Event"],
) {
  for (const key of [jam.id, jam.slug]) {
    queryClient.setQueryData<Schemas["EventResponse"] | null>(
      ["event", key],
      (old) => (old ? { ...old, ...event } : old),
    );
  }
}

/** The jam's battles in display order, each with its entries. */
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

/** The most drafts one request counts: the API's largest page. */
const DRAFTS_COUNTED = 200;

/** How many of the caller's jams are drafts, for the account menu's "N drafts". */
export function useMyDraftCount() {
  return useQuery({
    queryKey: ["events", "mine", "drafts"],
    queryFn: async () => {
      const page = unwrap(
        await api.GET("/api/events", {
          params: {
            query: { mine: true, status: "draft", limit: DRAFTS_COUNTED },
          },
        }),
        "my drafts",
      );
      return page.items.length;
    },
  });
}
