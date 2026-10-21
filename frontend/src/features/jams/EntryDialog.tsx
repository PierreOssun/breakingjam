import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { FormError } from "../../components/FormError";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/useToast";
import { applyFieldErrors } from "../../lib/apiErrors";
import { CrewPicker } from "../crews/CrewPicker";
import { DancerPicker } from "../dancers/DancerPicker";
import { membersPerEntry } from "./battleFields";
import { entryBody, type EntryFormValues, entryValues } from "./entryFields";

const FIELDS = [
  "team_name",
  "status",
  "reached",
  "final_rank",
  "video_url",
] as const;
const STAGES: Schemas["BracketStage"][] = [
  "na",
  "prelims",
  "top64",
  "top32",
  "top16",
  "top8",
  "top4",
  "top2",
  "winner",
];

type EntryDialogProps = {
  battle: Schemas["Battle"];
  /** The entry to edit; a new one when absent. */
  entry?: Schemas["Entry"];
  onClose: () => void;
};

/** Register an entry, or record how it did: members, team, status, result and video. */
export function EntryDialog({ battle, entry, onClose }: EntryDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const size = membersPerEntry(battle);
  const [members, setMembers] = useState(entry?.members ?? []);
  const [crew, setCrew] = useState(entry?.crew ?? null);
  const form = useForm<EntryFormValues>({ defaultValues: entryValues(entry) });
  const { register, handleSubmit, setError, formState } = form;
  const { errors, isDirty } = formState;

  const save = useMutation({
    mutationFn: async (body: Schemas["EntryFields"]) =>
      entry
        ? api.PUT("/api/entries/{id}", {
            params: { path: { id: entry.id } },
            body,
          })
        : api.POST("/api/battles/{id}/entries", {
            params: { path: { id: battle.id } },
            body,
          }),
    onSuccess: ({ data, error }) => {
      if (!data) {
        applyFieldErrors(setError, error, FIELDS);
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["battle", battle.id, "entries"],
      });
      toast({ kind: "success", message: t("org.entries.saved") });
      onClose();
    },
    onError: () => setError("root", { message: t("errors.generic") }),
  });

  const submit = handleSubmit((values) => {
    if (members.length === 0) {
      setError("root", { message: t("org.entries.needMembers") });
      return;
    }
    save.mutate(
      entryBody(values, {
        dancerIds: members.map((m) => m.id),
        crewId: crew?.id ?? null,
      }),
    );
  });

  return (
    <Dialog
      onClose={onClose}
      size="form"
      title={entry ? t("org.entries.edit") : t("org.entries.add")}
      confirmClose={isDirty ? t("form.discard") : undefined}
      action={{ label: t("form.save"), form: formId, loading: save.isPending }}
    >
      <p className="text-body-sm text-muted">{battle.name}</p>
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-6"
        onSubmit={submit}
      >
        <DancerPicker
          label={
            size === 1
              ? t("org.entries.dancer")
              : t("org.entries.members", { count: size })
          }
          selected={members}
          onChange={setMembers}
          max={size}
        />
        {size > 1 && (
          <>
            <TextField
              label={<OptionalLabel label={t("org.entries.teamName")} />}
              error={errors.team_name?.message}
              {...register("team_name")}
            />
            <CrewPicker
              label={t("org.entries.crew")}
              value={crew}
              onChange={setCrew}
            />
          </>
        )}
        <SelectField
          label={t("org.entries.status")}
          error={errors.status?.message}
          {...register("status")}
        >
          <option value="pending">{t("org.entries.statuses.pending")}</option>
          <option value="confirmed">
            {t("org.entries.statuses.confirmed")}
          </option>
          <option value="withdrawn">
            {t("org.entries.statuses.withdrawn")}
          </option>
        </SelectField>
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField
            label={t("org.entries.reached")}
            error={errors.reached?.message}
            {...register("reached")}
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {t(`org.entries.stages.${stage}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            type="number"
            inputMode="numeric"
            min={1}
            label={<OptionalLabel label={t("org.entries.finalRank")} />}
            hint={t("org.entries.finalRankHint")}
            error={errors.final_rank?.message}
            {...register("final_rank")}
          />
        </div>
        <TextField
          type="url"
          label={<OptionalLabel label={t("org.entries.video")} />}
          hint={t("org.entries.videoHint")}
          placeholder="https://www.youtube.com/watch?v="
          error={errors.video_url?.message}
          {...register("video_url")}
        />
        <TextField
          label={<OptionalLabel label={t("org.entries.videoStart")} />}
          hint={t("org.entries.videoStartHint")}
          placeholder="1:02:03"
          inputMode="numeric"
          {...register("video_start")}
        />
        <FormError message={errors.root?.message} />
      </form>
    </Dialog>
  );
}
