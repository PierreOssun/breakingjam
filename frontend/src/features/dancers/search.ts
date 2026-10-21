import { useInfiniteQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";

/** Up to eight dancers matching `q`: the pickers and the merge tool search the same way. */
export async function searchDancers(q: string) {
  const page = unwrap(
    await api.GET("/api/dancers", { params: { query: { q, limit: 8 } } }),
    "search dancers",
  );
  return page.items;
}

/** Everyone matching `q` (everyone when blank), notable dancers first, twenty at a time. */
export function useDancerSearch(q: string) {
  return useInfiniteQuery({
    // Not `["dancers", "search", q]`: the pickers cache their plain lists there (SearchPicker).
    queryKey: ["dancers", "pages", q],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/api/dancers", {
          params: {
            query: { q: q || undefined, limit: 20, cursor: pageParam },
          },
        }),
        "search dancers",
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
