import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** An organiser page; null when the account has none (§12c). */
export function useOrganizer(id: string) {
  return useQuery({
    queryKey: ["organizer", id],
    queryFn: async () => {
      const reply = await api.GET("/api/organizers/{id}", {
        params: { path: { id } },
      });
      if (reply.response.status === 404 || reply.response.status === 400)
        return null;
      return unwrap(reply, "organizer");
    },
  });
}

/** The organiser's public jams, upcoming and past. */
export function useOrganizerEvents(id: string) {
  return useQuery({
    queryKey: ["organizer", id, "events"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/organizers/{id}/events", {
          params: { path: { id } },
        }),
        "organizer events",
      ),
  });
}
