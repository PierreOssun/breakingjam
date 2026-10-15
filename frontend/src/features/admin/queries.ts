import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

/** The admin overview counts (`GET /api/admin/stats`); every admin decision refreshes them. */
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data, response } = await api.GET("/api/admin/stats");
      if (!data) throw new Error(`admin stats: ${response.status}`);
      return data;
    },
  });
}
