import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

/** An organiser page; null when the account has none (§12c). */
export function useOrganizer(id: string) {
  return useQuery({
    queryKey: ["organizer", id],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/organizers/{id}", {
        params: { path: { id } },
      });
      if (response.status === 404 || response.status === 400) return null;
      if (!data) throw new Error(`organizer: ${response.status}`);
      return data;
    },
  });
}

/** The organiser's public jams, upcoming and past. */
export function useOrganizerEvents(id: string) {
  return useQuery({
    queryKey: ["organizer", id, "events"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/organizers/{id}/events", {
        params: { path: { id } },
      });
      if (!data) throw new Error(`organizer events: ${response.status}`);
      return data;
    },
  });
}

/** Your latest Instagram claim; null when there is none. */
export function useOrganizerClaim(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["organizer", id, "claim"],
    enabled,
    queryFn: async () => {
      const { data, response } = await api.GET("/api/organizers/{id}/claim", {
        params: { path: { id } },
      });
      if (response.status === 404) return null;
      if (!data) throw new Error(`organizer claim: ${response.status}`);
      return data;
    },
  });
}

/** "Verify Instagram": opens a claim on the current handle, or returns the pending one. */
export function useOpenOrganizerClaim(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST("/api/organizers/{id}/claim", {
        params: { path: { id } },
      });
      if (!data) throw new Error(error?.error.message ?? "claim failed");
      return data;
    },
    onSuccess: (claim) =>
      queryClient.setQueryData(["organizer", id, "claim"], claim),
  });
}
