import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

const key = (dancerId: string) => ["dancer", dancerId, "claim"];

/** The caller's latest claim on a dancer page; null when there is none (§4 "Verify me"). */
export function useMyClaim(dancerId: string, enabled: boolean) {
  return useQuery({
    queryKey: key(dancerId),
    enabled,
    queryFn: async () => {
      const { data, response } = await api.GET("/api/dancers/{id}/claim", {
        params: { path: { id: dancerId } },
      });
      if (response.status === 404) return null;
      if (!data) throw new Error(`claim: ${response.status}`);
      return data;
    },
  });
}

/** "This is me": opens a claim, or returns the pending one, with its code. */
export function useOpenClaim(dancerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(
        "/api/dancers/{id}/claim",
        { params: { path: { id: dancerId } } },
      );
      if (!data) throw new ClaimError(response.status, error?.error.message);
      return data;
    },
    onSuccess: (claim) => queryClient.setQueryData(key(dancerId), claim),
  });
}

/** A refused claim: 409 when the page is verified or the account already owns one. */
export class ClaimError extends Error {
  constructor(
    readonly status: number,
    message = `claim: ${status}`,
  ) {
    super(message);
  }
}
