import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

export const ME_KEY = ["me"] as const;

/** The logged-in account, `null` when logged out. Auth state for the whole app (§6). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const reply = await api.GET("/api/auth/me");
      if (reply.response.status === 401) return null;
      return unwrap(reply, "me");
    },
    // `me` also slides the session forward, so one call per visit is enough.
    staleTime: Infinity,
  });
}
