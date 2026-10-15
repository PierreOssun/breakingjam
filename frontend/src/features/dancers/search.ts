import { api } from "../../api/client";

/** Up to eight dancers matching `q`: the pickers and the merge tool search the same way. */
export async function searchDancers(q: string) {
  const { data, response } = await api.GET("/api/dancers", {
    params: { query: { q, limit: 8 } },
  });
  if (!data) throw new Error(`search dancers: ${response.status}`);
  return data.items;
}
