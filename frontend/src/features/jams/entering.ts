// Who sees what at the bottom of a battle card (M32, DESIGN.md §4.46), and entering, leaving,
// asking and answering. The state is pure, so it is tested without a page.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, type Schemas, unwrap } from "../../api/client";
import { useMe } from "../auth/useMe";

type Jam = Schemas["EventResponse"];
type Battle = Schemas["BattleDetail"];
type Me = Schemas["UserResponse"];
type MyRequest = Schemas["MyRequest"];

/** The battle card's action, the first that matches in this order. */
export type EntryState =
  | "organiser"
  | "closed"
  | "site"
  | "contact"
  | "in"
  | "pending"
  | "declined"
  | "full"
  | "login"
  | "verify"
  | "ask"
  | "enter";

/** The states that let this viewer go for a place: "Enter a battle" leads to them. */
export const GOING_FOR_A_PLACE: EntryState[] = [
  "enter",
  "ask",
  "login",
  "verify",
];

/** Entries still in: withdrawn ones hold no place. */
export const activeEntries = (battle: Battle) =>
  battle.entries.filter((entry) => entry.status !== "withdrawn");

/** The viewer's own entry in the battle, through their verified page. */
export function myEntry(battle: Battle, me: Me | null | undefined) {
  const page = me?.dancer?.verified ? me.dancer.id : null;
  return page
    ? activeEntries(battle).find((e) => e.members.some((m) => m.id === page))
    : undefined;
}

/** How many places are left, or null without a maximum. */
export function placesLeft(battle: Battle): number | null {
  return battle.max_entries == null
    ? null
    : Math.max(0, battle.max_entries - activeEntries(battle).length);
}

/**
 * What the card shows `me` (`null` logged out), given their latest request in this battle:
 * nothing once the jam is past, where results speak; the setting for its editors; else from
 * closed down to "Ask to enter" or "Enter battle".
 */
export function entryState(
  jam: Jam,
  battle: Battle,
  me: Me | null | undefined,
  request?: MyRequest,
): EntryState | null {
  if (jam.phase === "past") return null;
  if (jam.can_edit_battles) return "organiser";
  // The API's word: announced, registration not closed, not started yet.
  if (!jam.takes_entries) return "closed";
  if (battle.registration === "organizer")
    return jam.registration_url ? "site" : "contact";
  if (myEntry(battle, me)) return "in";
  if (request?.status === "pending") return "pending";
  if (request?.status === "rejected" && battle.registration === "approval")
    return "declined";
  if (placesLeft(battle) === 0) return "full";
  if (!me) return "login";
  if (!me.dancer?.verified) return "verify";
  return battle.registration === "approval" ? "ask" : "enter";
}

/** A refusal with the API's code, for the cases a page answers on its own: `battle_full`,
 * `already_entered`, `already_requested`. */
class ApiRefusal extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

const refusal = (
  error: { error: { message: string; code: string } } | undefined,
  fallback: string,
) => new ApiRefusal(error?.error.message ?? fallback, error?.error.code);

/** The API's code of a refusal, if it was one. */
export const codeOf = (error: Error) =>
  error instanceof ApiRefusal ? error.code : undefined;

/** Whether an enter or a request failed only because it is done already (a double tap, another
 * tab): the page reads it again and says so. */
export const doneAlready = (error: Error) =>
  codeOf(error) === "already_entered" || codeOf(error) === "already_requested";

/** Whether it failed because the last place went to someone else first. */
export const filledUp = (error: Error) => codeOf(error) === "battle_full";

/** Reads the jam, its battles and the viewer's requests again: anything here may change them. */
function refresh(queryClient: QueryClient, jam: Jam) {
  for (const key of [jam.id, jam.slug])
    void queryClient.invalidateQueries({ queryKey: ["event", key] });
}

/**
 * Enter an open battle, or leave it. Entering marks the account as going. Both run from a
 * sheet, which shows their errors itself: a toast would sit under it.
 */
export function useEntering(jam: Jam, battle: Battle) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const options = { params: { path: { id: battle.id } } };
  const enter = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.POST(
        "/api/battles/{id}/enter",
        options,
      );
      if (!data) throw refusal(error, t("errors.generic"));
      return data;
    },
    onSettled: () => refresh(queryClient, jam),
  });
  const leave = useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE("/api/battles/{id}/enter", options);
      // 404: out already (a double tap, another tab), which is what they asked for.
      if (!response.ok && response.status !== 404)
        throw new Error(t("errors.generic"));
    },
    onSuccess: () => refresh(queryClient, jam),
  });
  return { enter, leave };
}

/** The viewer's latest request in each battle of the jam, by battle; none while logged out. */
export function useMyRequests(jam: Jam) {
  const me = useMe().data;
  const query = useQuery({
    queryKey: ["event", jam.id, "requests", "mine"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/events/{id}/requests/mine", {
          params: { path: { id: jam.id } },
        }),
        "my requests",
      ),
    enabled: !!me,
  });
  return new Map((query.data ?? []).map((r) => [r.battle_id, r]));
}

/** Ask to enter a battle "with approval", or take the request back. */
export function useAsking(jam: Jam, battle: Battle) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ask = useMutation({
    mutationFn: async (body: Schemas["RequestFields"]) => {
      const { data, error } = await api.POST("/api/battles/{id}/requests", {
        params: { path: { id: battle.id } },
        body,
      });
      if (!data) throw refusal(error, t("errors.generic"));
      return data;
    },
    onSettled: () => refresh(queryClient, jam),
  });
  const cancel = useMutation({
    mutationFn: async (request: string) => {
      const { response } = await api.DELETE("/api/requests/{id}", {
        params: { path: { id: request } },
      });
      // 404: taken back or answered already; the page reads which.
      if (!response.ok && response.status !== 404)
        throw new Error(t("errors.generic"));
    },
    onSettled: () => refresh(queryClient, jam),
  });
  return { ask, cancel };
}

/** The requests waiting in the jam's battles, for its editors; none for anyone else. */
export function useJamRequests(jam: Jam) {
  return useQuery({
    queryKey: ["event", jam.id, "requests", "waiting"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/events/{id}/requests", {
          params: { path: { id: jam.id } },
        }),
        "requests",
      ),
    enabled: jam.can_edit_battles,
  });
}

/** Accept or decline a request; the account menu's count follows. */
export function useAnswering(jam: Jam) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      request,
      answer,
    }: {
      request: string;
      answer: "accept" | "decline";
    }) => {
      const options = { params: { path: { id: request } } };
      const { error, response } =
        answer === "accept"
          ? await api.POST("/api/requests/{id}/accept", options)
          : await api.POST("/api/requests/{id}/decline", options);
      if (!response.ok) throw refusal(error, t("errors.generic"));
    },
    onSettled: () => {
      refresh(queryClient, jam);
      void queryClient.invalidateQueries({ queryKey: ["requests", "waiting"] });
    },
  });
}

/** The account's own jams with requests waiting (the account menu's "Requests"). */
export function useWaitingRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["requests", "waiting"],
    queryFn: async () =>
      unwrap(await api.GET("/api/requests/waiting"), "waiting requests"),
    enabled,
  });
}
