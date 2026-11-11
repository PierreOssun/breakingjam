import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { useToast } from "../../components/useToast";
import {
  type Draft,
  draftOf,
  entryVideo,
  firstRoundFor,
  matchesBody,
  roundsOf,
  type Slot,
  withSlot,
} from "./results";
import { SAVE_DELAY_MS, type SaveState } from "./useAutosave";

type Battle = Schemas["BattleDetail"];
type Round = Schemas["MatchRound"];

/** The Results step's draft, saved a moment after each change, as the jam editor saves (M24). */
export function useResults(jamId: string, battle: Battle | undefined) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const rounds = useMemo(
    () => roundsOf(battle?.bracket_size),
    [battle?.bracket_size],
  );
  const [draft, setDraft] = useState<Draft>(() =>
    draftOf(rounds, battle?.matches ?? []),
  );
  const entrants =
    battle?.entries.filter((e) => e.status !== "withdrawn").length ?? 0;
  const [round, setRound] = useState<Round | undefined>(() =>
    firstRoundFor(rounds, entrants),
  );
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(draft);
  // What the server holds: a bad link falls back to its link there.
  const saved = useRef(draft);
  // The same, as the body that would send it, to skip saves that change nothing.
  const stored = useRef(JSON.stringify(matchesBody(rounds, draft)));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = useRef(false);
  // Changed while a save was out: save once more when it lands.
  const again = useRef(false);
  const battleId = battle?.id;

  const unsaved = () =>
    JSON.stringify(matchesBody(rounds, latest.current, saved.current)) !==
    stored.current;

  /** Saves the latest draft; true when the server holds it. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!battleId) return true;
    if (busy.current) {
      again.current = true;
      return true;
    }
    const body = matchesBody(rounds, latest.current, saved.current);
    const sent = JSON.stringify(body);
    if (sent === stored.current) {
      setState("saved");
      return true;
    }
    busy.current = true;
    setState("saving");
    let problem: string | null = null;
    try {
      const { data, response } = await api.PUT("/api/battles/{id}/matches", {
        params: { path: { id: battleId } },
        body,
      });
      if (data) {
        stored.current = sent;
        saved.current = draftOf(rounds, data);
        // The placings follow the matches: the page behind the sheet shows both.
        void queryClient.invalidateQueries({
          queryKey: ["event", jamId, "battles"],
        });
      } else {
        // Bad links never go out, so a refusal is about who battled whom.
        problem = t(
          response.status === 422 ? "org.results.invalid" : "errors.generic",
        );
      }
    } catch {
      problem = t("errors.generic");
    }
    busy.current = false;
    setError(problem);
    if (again.current) {
      again.current = false;
      return save();
    }
    // Changed meanwhile: this answer says nothing about the newest change.
    const waiting = timer.current !== undefined;
    setState(waiting ? "saving" : problem ? "error" : "saved");
    return problem === null;
  }, [battleId, rounds, jamId, queryClient, t]);

  const change = (round: Round, index: number, change: Partial<Slot>) => {
    let next = withSlot(latest.current, round, index, change);
    const slot = next[round]?.[index];
    if (change.winner && slot) {
      const entries = battle?.entries ?? [];
      next = withSlot(next, round, index, entryVideo(round, slot, entries));
    }
    latest.current = next;
    setDraft(next);
    setState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void save();
    }, SAVE_DELAY_MS);
  };

  // Closing the sheet sends what is still waiting, and says so when it can't.
  const leave = useRef(() => {});
  leave.current = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!unsaved()) return;
    void save().then((done) => {
      if (!done) toast({ kind: "error", message: t("org.editor.leftUnsaved") });
    });
  };
  useEffect(() => () => leave.current(), []);

  return {
    rounds,
    draft,
    round,
    setRound,
    state,
    error,
    change,
    retry: () => void save(),
  };
}

export type Results = ReturnType<typeof useResults>;
