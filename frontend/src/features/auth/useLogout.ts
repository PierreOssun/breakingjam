import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api, unwrap } from "../../api/client";
import { ME_KEY } from "./useMe";

/** Logs out, forgets the session, then goes home; `onDone` runs first (e.g. to close a menu). */
export function useLogout(onDone?: () => void) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    // Only a 2xx means the session is gone.
    mutationFn: async () =>
      unwrap(await api.POST("/api/auth/logout"), "logout"),
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      // What the account could see or do (its jams, edit rights, claim codes) must not wait
      // in the cache for the next person on this device.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== ME_KEY[0],
      });
      onDone?.();
      navigate("/");
    },
  });
}
