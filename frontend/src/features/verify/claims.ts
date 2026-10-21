import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** Whose page a claim is on: the two kinds share one flow (§4 "Verify me"). */
export type ClaimKind = "dancers" | "organizers";

const key = (kind: ClaimKind, id: string) => [
  kind === "dancers" ? "dancer" : "organizer",
  id,
  "claim",
];

/** The caller's latest claim on a page; null when there is none. */
export function useClaim(kind: ClaimKind, id: string, enabled: boolean) {
  return useQuery({
    queryKey: key(kind, id),
    enabled,
    queryFn: async () => {
      const reply = await api.GET(`/api/${kind}/{id}/claim`, {
        params: { path: { id } },
      });
      if (reply.response.status === 404) return null;
      return unwrap(reply, "claim");
    },
  });
}

/** "This is me" / "Verify Instagram": opens a claim, or returns the pending one, with its code. */
export function useOpenClaim(kind: ClaimKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST(
        `/api/${kind}/{id}/claim`,
        { params: { path: { id } } },
      );
      if (!data) throw new ClaimError(response.status, error?.error.message);
      return data;
    },
    onSuccess: (claim) => queryClient.setQueryData(key(kind, id), claim),
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
