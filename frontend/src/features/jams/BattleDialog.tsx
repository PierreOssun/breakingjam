import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
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
import { formatShortDateRange } from "../../lib/dates";
import {
  type AgePreset,
  battleBody,
  type BattleFormValues,
  battleValues,
  currencies,
  defaultBattleName,
  PLACES,
  PRESET_AGES,
} from "./battleFields";

const FIELDS = [
  "name",
  "format",
  "team_size",
  "gender",
  "age_min",
  "age_max",
  "bracket_size",
  "max_entries",
  "prize_currency",
  "prize_first",
  "prize_second",
  "prize_third",
  "starts_at",
] as const;
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BRACKETS = [2, 4, 8, 16, 32, 64];

type BattleDialogProps = {
  jamId: string;
  /** The jam's days, `YYYY-MM-DD`; a battle starts on one of them. */
  days: string[];
  /** The battle to edit; a new one when absent. */
  battle?: Schemas["Battle"];
  onClose: () => void;
};

/** Add or edit a battle: format, size, who may enter, age, bracket, spots and prizes (§4). */
export function BattleDialog({
  jamId,
  days,
  battle,
  onClose,
}: BattleDialogProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const money = useMemo(
    () => currencies(i18n.language, battle?.prize_currency),
    [i18n.language, battle?.prize_currency],
  );
  const form = useForm<BattleFormValues>({
    defaultValues: battleValues(days[0] ?? "", battle),
  });
  const { register, handleSubmit, setError, setValue, watch } = form;
  const { errors, isDirty } = form.formState;
  const values = watch();

  const save = useMutation({
    mutationFn: async (body: Schemas["BattleFields"]) =>
      battle
        ? api.PUT("/api/battles/{id}", {
            params: { path: { id: battle.id } },
            body,
          })
        : api.POST("/api/events/{id}/battles", {
            params: { path: { id: jamId } },
            body,
          }),
    onSuccess: ({ data, error }) => {
      if (!data) {
        // The day and time are one field to the server.
        applyFieldErrors(setError, error, FIELDS, { starts_at: "start_time" });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["event", jamId, "battles"],
      });
      toast({ kind: "success", message: t("org.battles.saved") });
      onClose();
    },
    onError: () => setError("root", { message: t("errors.generic") }),
  });

  const choosePreset = (preset: AgePreset) => {
    const [min, max] = PRESET_AGES[preset];
    setValue("age_min", min);
    setValue("age_max", max);
  };

  return (
    <Dialog
      onClose={onClose}
      size="form"
      title={battle ? t("org.battles.edit") : t("org.battles.add")}
      confirmClose={isDirty ? t("form.discard") : undefined}
      action={{ label: t("form.save"), form: formId, loading: save.isPending }}
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-6"
        onSubmit={handleSubmit((v) => save.mutate(battleBody(v)))}
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField
            label={t("org.battles.format")}
            data-autofocus
            error={errors.format?.message}
            {...register("format")}
          >
            <option value="team">{t("org.battles.formats.team")}</option>
            <option value="seven_to_smoke">
              {t("org.battles.formats.seven_to_smoke")}
            </option>
            <option value="na">{t("org.battles.formats.na")}</option>
          </SelectField>
          {values.format === "team" && (
            <SelectField
              label={t("org.battles.teamSize")}
              error={errors.team_size?.message}
              {...register("team_size")}
            >
              {SIZES.map((n) => (
                <option key={n} value={n}>{`${n}v${n}`}</option>
              ))}
            </SelectField>
          )}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField label={t("org.battles.gender")} {...register("gender")}>
            <option value="bboy">{t("org.battles.genders.bboy")}</option>
            <option value="bgirl">{t("org.battles.genders.bgirl")}</option>
            <option value="mixed">{t("org.battles.genders.mixed")}</option>
          </SelectField>
          <SelectField
            label={t("org.battles.age")}
            {...register("preset", {
              onChange: (e) => choosePreset(e.target.value as AgePreset),
            })}
          >
            <option value="kids">{t("org.battles.ages.kids")}</option>
            <option value="adult">{t("org.battles.ages.adult")}</option>
            <option value="masters">{t("org.battles.ages.masters")}</option>
            <option value="na">{t("org.battles.ages.na")}</option>
          </SelectField>
        </div>
        {values.preset === "kids" && (
          <TextField
            type="number"
            inputMode="numeric"
            min={0}
            max={17}
            label={t("org.battles.kidsFrom")}
            hint={t("org.battles.kidsFromHint")}
            error={errors.age_min?.message ?? errors.age_max?.message}
            {...register("age_min")}
          />
        )}
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField
            label={<OptionalLabel label={t("org.battles.bracket")} />}
            error={errors.bracket_size?.message}
            {...register("bracket_size")}
          >
            <option value="">{t("org.battles.bracketUnknown")}</option>
            {BRACKETS.map((n) => (
              <option key={n} value={n}>
                {t("org.battles.bracketOf", { n })}
              </option>
            ))}
          </SelectField>
          <TextField
            type="number"
            inputMode="numeric"
            min={1}
            label={<OptionalLabel label={t("org.battles.maxEntries")} />}
            error={errors.max_entries?.message}
            {...register("max_entries")}
          />
        </div>
        {/* One-day jams need only the time; longer ones also the day (DESIGN.md §6). */}
        <div className="grid gap-6 sm:grid-cols-2">
          {days.length > 1 && (
            <SelectField
              label={t("org.battles.startDay")}
              {...register("start_day")}
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {formatShortDateRange(day, day, i18n.language)}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            type="time"
            label={<OptionalLabel label={t("org.battles.startTime")} />}
            hint={t("org.battles.startTimeHint")}
            error={errors.start_time?.message}
            {...register("start_time")}
          />
        </div>
        <SelectField
          label={<OptionalLabel label={t("org.battles.prize")} />}
          error={errors.prize_currency?.message}
          {...register("prize_currency")}
        >
          <option value="">{t("org.battles.noPrize")}</option>
          {money.map(({ code, name }) => (
            <option key={code} value={code}>{`${code} · ${name}`}</option>
          ))}
        </SelectField>
        {values.prize_currency && (
          <div className="grid gap-6 sm:grid-cols-3">
            {PLACES.map((place) => (
              <TextField
                key={place}
                type="number"
                inputMode="numeric"
                min={0}
                label={
                  <OptionalLabel label={t(`org.battles.places.${place}`)} />
                }
                error={errors[`prize_${place}`]?.message}
                {...register(`prize_${place}`)}
              />
            ))}
          </div>
        )}
        <TextField
          label={<OptionalLabel label={t("org.battles.name")} />}
          hint={t("org.battles.nameHint")}
          placeholder={defaultBattleName(battleBody(values))}
          error={errors.name?.message}
          {...register("name")}
        />
        <FormError message={errors.root?.message} />
      </form>
    </Dialog>
  );
}
