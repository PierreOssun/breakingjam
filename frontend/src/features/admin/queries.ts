import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** The admin overview counts (`GET /api/admin/stats`); every admin decision refreshes them. */
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () =>
      unwrap(await api.GET("/api/admin/stats"), "admin stats"),
  });
}
