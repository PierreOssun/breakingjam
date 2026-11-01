// Autosave for the jam editor (M24): edits stay local and go out as one PUT a moment after
// typing stops, so the organiser never presses Save. A field the API would refuse keeps its
// stored value in that PUT, so one bad link never holds back the rest of the jam.
import { useQueryClient } from "@tanstack/react-query";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { useToast } from "../../components/useToast";
import { splitFieldErrors } from "../../lib/apiErrors";
import {
  JAM_FIELDS,
  type JamFormValues,
  jamBody,
  jamProblems,
  jamValues,
  sameJam,
  type SaveErrors,
  type TextField,
  withheld,
} from "./jamFields";

type Jam = Schemas["EventResponse"];

/** Where the last edit stands. */
export type SaveState = "saved" | "saving" | "error";

/** How long typing may pause before the save goes out. */
export const SAVE_DELAY_MS = 800;

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** A change to the draft: the new values, or a function of the latest ones for a change
 * decided after an await, when what was typed meanwhile must win. */
export type Patch =
  Partial<JamFormValues> | ((current: JamFormValues) => Partial<JamFormValues>);

/** The editor's copy of the jam, with `set` to change it and what the server made of it. */
export type JamDraft = {
  values: JamFormValues;
  set: (patch: Patch) => void;
  state: SaveState;
  errors: SaveErrors;
  /** Sends the jam again, after a save that failed for no fault of a field. */
  retry: () => void;
  /** The props that tie a control to one text value: what it shows, its error, and typing. */
  field: (name: TextField) => {
    value: string;
    error: string | undefined;
    onChange: (e: ChangeEvent<Control>) => void;
  };
};

/** The jam as typed, saved after each pause; the cached jam follows every successful save. */
export function useJamAutosave(jam: Jam): JamDraft {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => jamValues(jam));
  const [state, setState] = useState<SaveState>("saved");
  const [errors, setErrors] = useState<SaveErrors>({});
  const latest = useRef(values);
  const stored = useRef(values);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = useRef(false);
  // Typed while a save was out: save once more when it lands.
  const again = useRef(false);
  const isDraft = jam.status === "draft";

  /** The PUT: null when accepted, else what the server refused. */
  const send = useCallback(
    async (next: JamFormValues): Promise<SaveErrors | null> => {
      try {
        const { data, error } = await api.PUT("/api/events/{id}", {
          params: { path: { id: jam.id } },
          body: jamBody(next),
        });
        if (!data) {
          const { fields, rest } = splitFieldErrors(error, JAM_FIELDS);
          return { ...Object.fromEntries(fields), root: rest ?? undefined };
        }
        stored.current = next;
        for (const key of [jam.id, jam.slug]) {
          queryClient.setQueryData<Jam | null>(["event", key], (old) =>
            old ? { ...old, ...data } : old,
          );
        }
        void queryClient.invalidateQueries({ queryKey: ["events"] });
        return null;
      } catch {
        return { root: t("errors.generic") };
      }
    },
    [jam.id, jam.slug, queryClient, t],
  );

  /** Saves what can be saved; true when nothing is left out. */
  const save = useCallback(async (): Promise<boolean> => {
    if (busy.current) {
      again.current = true;
      return true;
    }
    const kept = isDraft ? undefined : stored.current;
    const problems = jamProblems(latest.current, t, kept);
    const next = withheld(latest.current, stored.current, problems);
    const clean = Object.keys(problems).length === 0;
    if (sameJam(next, stored.current)) {
      setErrors(problems);
      setState(clean ? "saved" : "error");
      return clean;
    }
    busy.current = true;
    setState("saving");
    const refused = await send(next);
    busy.current = false;
    const done = clean && !refused;
    setErrors({ ...refused, ...problems });
    // Typing went on meanwhile: this answer says nothing about the newest edit.
    const waiting = timer.current !== undefined || again.current;
    setState(waiting ? "saving" : done ? "saved" : "error");
    if (again.current) {
      again.current = false;
      return save();
    }
    return done;
  }, [isDraft, send, t]);

  const set = useCallback(
    (patch: Patch) => {
      const change =
        typeof patch === "function" ? patch(latest.current) : patch;
      latest.current = { ...latest.current, ...change };
      setValues(latest.current);
      setState("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void save();
      }, SAVE_DELAY_MS);
    },
    [save],
  );

  // Leaving the page sends what is still waiting, and says so when it can't.
  const leave = useRef(() => {});
  leave.current = () => {
    if (sameJam(latest.current, stored.current)) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    void save().then((done) => {
      if (!done) toast({ kind: "error", message: t("org.editor.leftUnsaved") });
    });
  };
  useEffect(() => () => leave.current(), []);

  // Closing the tab can't wait for a save: the browser asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!sameJam(latest.current, stored.current)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const retry = useCallback(() => void save(), [save]);

  const field = useCallback(
    (name: TextField) => ({
      value: values[name],
      error: errors[name],
      onChange: (e: ChangeEvent<Control>) => set({ [name]: e.target.value }),
    }),
    [values, errors, set],
  );

  return { values, set, state, errors, retry, field };
}
