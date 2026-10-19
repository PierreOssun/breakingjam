import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

/** Up to eight dancers matching `q`: the pickers and the merge tool search the same way. */
export async function searchDancers(q: string) {
  const { data, response } = await api.GET("/api/dancers", {
    params: { query: { q, limit: 8 } },
  });
  if (!data) throw new Error(`search dancers: ${response.status}`);
  return data.items;
}

/** Everyone matching `q` (everyone when blank), notable dancers first, twenty at a time. */
export function useDancerSearch(q: string) {
  return useInfiniteQuery({
    queryKey: ["dancers", "search", q],
    queryFn: async ({ pageParam }) => {
      const { data, response } = await api.GET("/api/dancers", {
        params: { query: { q: q || undefined, limit: 20, cursor: pageParam } },
      });
      if (!data) throw new Error(`search dancers: ${response.status}`);
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
