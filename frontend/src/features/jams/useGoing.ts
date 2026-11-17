import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { useToast } from "../../components/useToast";

type Jam = Schemas["EventResponse"];
type Going = Schemas["Going"];

/**
 * "I'm going" and back (M32): the button and the count change at once, and go back with an
 * error toast if the API refuses. The page's jam is cached under its id and its slug.
 */
export function useGoing(jam: Jam) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const keys = [jam.id, jam.slug].map((key) => ["event", key]);
  const write = (going: Going) => {
    for (const key of keys)
      queryClient.setQueryData<Jam | null>(key, (old) =>
        old ? { ...old, ...going } : old,
      );
  };
  return useMutation({
    mutationFn: async (going: boolean) => {
      const options = { params: { path: { id: jam.id } } };
      const { data, error } = going
        ? await api.PUT("/api/events/{id}/going", options)
        : await api.DELETE("/api/events/{id}/going", options);
      if (!data) throw new Error(error?.error.message ?? t("errors.generic"));
      return data;
    },
    onMutate: (going) => {
      const before = { going_count: jam.going_count, going: jam.going };
      if (going !== jam.going)
        write({ going, going_count: jam.going_count + (going ? 1 : -1) });
      return before;
    },
    onError: (_error, _going, before) => {
      if (before) write(before);
      toast({ kind: "error", message: t("jam.going.failed") });
    },
    onSuccess: (going) => {
      write(going);
      // The list of who is going changed with it.
      void queryClient.invalidateQueries({
        queryKey: ["event", jam.id, "going"],
      });
    },
  });
}
