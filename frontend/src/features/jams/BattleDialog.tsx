import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useLayoutEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/useToast";
import { splitFieldErrors } from "../../lib/apiErrors";
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
] as const;
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BRACKETS = [2, 4, 8, 16, 32, 64];

type BattleDialogProps = {
  jamId: string;
  /** The battle to edit; a new one when absent. */
  battle?: Schemas["Battle"];
  open: boolean;
  onClose: () => void;
};

/** Add or edit a battle: format, size, who may enter, age, bracket, spots and prizes (§4). */
export function BattleDialog({
  jamId,
  battle,
  open,
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
  const form = useForm<BattleFormValues>({ defaultValues: battleValues() });
  const { register, handleSubmit, setError, setValue, watch, reset } = form;
  // Each opening starts from the battle being edited. A layout effect, so the reset lands
  // before the dialog shows and can never wipe what was just typed into it.
  useLayoutEffect(() => {
    if (open) reset(battleValues(battle));
  }, [open, battle, reset]);
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
        const { fields, rest } = splitFieldErrors(error, FIELDS);
        for (const [field, message] of fields) setError(field, { message });
        if (rest) setError("root", { message: rest });
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
      open={open}
      onClose={onClose}
      size="form"
      title={battle ? t("org.battles.edit") : t("org.battles.add")}
      confirmClose={isDirty ? t("form.discard") : undefined}
      footer={(close) => (
        <>
          <Button
            variant="ghost"
            className="flex-1 lg:flex-none"
            onClick={close}
          >
            {t("form.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            className="flex-[2] lg:flex-none"
            loading={save.isPending}
          >
            {t("form.save")}
          </Button>
        </>
      )}
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
        {errors.root?.message && (
          <p role="alert" className="text-body-sm font-bold text-danger">
            {errors.root.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
