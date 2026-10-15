import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

export const ME_KEY = ["me"] as const;

/** The logged-in account, `null` when logged out. Auth state for the whole app (§6). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const { data, response } = await api.GET("/api/auth/me");
      if (response.status === 401) return null;
      if (!data) throw new Error(`GET /api/auth/me: ${response.status}`);
      return data;
    },
    // `me` also slides the session forward, so one call per visit is enough.
    staleTime: Infinity,
  });
}
