import { CaretDown } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { ChipRow } from "../../components/ChipRow";
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
  battleSummary,
  battleValues,
  CATEGORIES,
  categoryOf,
  currencies,
  defaultBattleName,
  FORMATS,
  formatOf,
  membersPerEntry,
  PLACES,
  PRESET_AGES,
  withCategory,
  withFormat,
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
/** The fields under "More options", which stay open while the server refuses one of them. */
const MORE = [
  "team_size",
  "gender",
  "age_min",
  "age_max",
  "bracket_size",
  "name",
] as const;
const SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BRACKETS = [2, 4, 8, 16, 32, 64];

type Form = UseFormReturn<BattleFormValues>;
type Part = { form: Form; values: BattleFormValues };

type BattleDialogProps = {
  jamId: string;
  /** The jam's days, `YYYY-MM-DD`; a battle starts on one of them. */
  days: string[];
  /** The battle to edit; a new one when absent. */
  battle?: Schemas["Battle"];
  onClose: () => void;
};

/** The battle sheet (M24): category and format chips over the fields, start, spots and prize. */
export function BattleDialog({
  jamId,
  days,
  battle,
  onClose,
}: BattleDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const form = useForm<BattleFormValues>({
    defaultValues: battleValues(days[0] ?? "", battle),
  });
  const { clearErrors, handleSubmit, setError, setValue, watch } = form;
  const { errors, isDirty } = form.formState;
  const values = watch();
  // A stored battle that no chip describes opens with its fields showing.
  const [more, setMore] = useState(
    () => battle !== undefined && categoryOf(values) === undefined,
  );

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

  const pick = (next: BattleFormValues) => {
    for (const key of Object.keys(next) as (keyof BattleFormValues)[]) {
      if (next[key] !== values[key]) {
        setValue(key, next[key], { shouldDirty: true });
      }
    }
  };
  const category = categoryOf(values);
  const format = formatOf(values);

  return (
    <Dialog
      onClose={onClose}
      size="form"
      title={battle ? t("org.battles.edit") : t("org.battles.add")}
      confirmClose={isDirty ? t("form.discard") : undefined}
      action={{
        label: battle ? t("form.save") : t("org.battles.addAction"),
        form: formId,
        loading: save.isPending,
      }}
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          // The server's last refusals go stale on a new try; some, like `age_max`, sit on no
          // input, so the form would never clear them and never submit again.
          clearErrors();
          void handleSubmit((v) => save.mutate(battleBody(v)))(e);
        }}
      >
        <ChipRow
          label={t("org.battles.category")}
          chips={CATEGORIES.map((chip) => ({
            key: chip,
            label: t(`org.battles.categories.${chip}`),
            on: chip === category,
            onPick: () => pick(withCategory(values, chip)),
          }))}
        />
        <ChipRow
          label={t("org.battles.format")}
          error={errors.format?.message}
          chips={FORMATS.map((chip) => ({
            key: chip,
            label: t(`org.battles.formatChips.${chip}`),
            on: chip === format,
            // Picked again, the chip lets go: a battle whose bracket isn't known yet.
            onPick: () =>
              pick(withFormat(values, chip === format ? undefined : chip)),
          }))}
        />
        <StartAndSpots form={form} values={values} days={days} />
        <Prize form={form} values={values} keep={battle?.prize_currency} />
        <MoreOptions
          form={form}
          values={values}
          open={more || MORE.some((key) => errors[key])}
          onToggle={setMore}
        />
        <FormError message={errors.root?.message} />
      </form>
    </Dialog>
  );
}

/** When the battle starts (on which day, for longer jams) and how many may enter. */
function StartAndSpots({ form, values, days }: Part & { days: string[] }) {
  const { t, i18n } = useTranslation();
  const { register } = form;
  const { errors } = form.formState;
  const solo = membersPerEntry(battleBody(values)) === 1;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
      {/* One-day jams need only the time; longer ones also the day (DESIGN.md §6). */}
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
        error={errors.start_time?.message}
        {...register("start_time")}
      />
      <TextField
        type="number"
        inputMode="numeric"
        min={1}
        label={
          <OptionalLabel
            label={t(solo ? "org.battles.maxDancers" : "org.battles.maxTeams")}
          />
        }
        error={errors.max_entries?.message}
        {...register("max_entries")}
      />
    </div>
  );
}

/** The cash prize: a currency, then the three amounts beside it once there is one. */
function Prize({ form, values, keep }: Part & { keep?: string | null }) {
  const { t, i18n } = useTranslation();
  const { register } = form;
  const { errors } = form.formState;
  const money = useMemo(
    () => currencies(i18n.language, keep),
    [i18n.language, keep],
  );
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4">
      <SelectField
        className={`col-span-3 ${values.prize_currency ? "sm:col-span-1" : "sm:col-span-4"}`}
        label={<OptionalLabel label={t("org.battles.prize")} />}
        error={errors.prize_currency?.message}
        {...register("prize_currency")}
      >
        <option value="">{t("org.battles.noPrize")}</option>
        {money.map(({ code, name }) => (
          <option key={code} value={code}>{`${code} · ${name}`}</option>
        ))}
      </SelectField>
      {values.prize_currency &&
        PLACES.map((place) => (
          <TextField
            key={place}
            type="number"
            inputMode="numeric"
            min={0}
            label={t(`org.battles.places.${place}`)}
            error={errors[`prize_${place}`]?.message}
            {...register(`prize_${place}`)}
          />
        ))}
    </div>
  );
}

/** The fields the chips set, for what no chip says (3v3 Bgirl, Masters, Top 64, a name). */
function MoreOptions({
  form,
  values,
  open,
  onToggle,
}: Part & { open: boolean; onToggle: (open: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const { register, setValue } = form;
  const { errors } = form.formState;
  const panelId = useId();
  const body = battleBody(values);

  const choosePreset = (preset: AgePreset) => {
    const [min, max] = PRESET_AGES[preset];
    setValue("age_min", min);
    setValue("age_max", max);
  };

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
        className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-raised"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-bold">{t("org.battles.more")}</span>
          {/* What the battle card will say, its name included, so a hidden field is never a
              surprise: a naming chip may replace a typed name. */}
          <span className="text-body-sm text-muted">
            {[
              values.name.trim() &&
                t("org.battles.namedAs", { name: values.name.trim() }),
              battleSummary(body, t, i18n.language),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <CaretDown
          size={20}
          weight="bold"
          aria-hidden
          className={`shrink-0 transition-transform duration-fast ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {(values.format === "team" || values.format === "showcase") && (
              <SelectField
                label={t("org.battles.teamSize")}
                error={errors.team_size?.message}
                {...register("team_size")}
              >
                {/* A showcase may leave the size open; a team battle never does. */}
                {values.format === "showcase" && (
                  <option value="">{t("org.battles.anySize")}</option>
                )}
                {SIZES.map((n) => (
                  <option key={n} value={n}>
                    {values.format === "showcase"
                      ? t("org.battles.crewsOf", { count: n })
                      : `${n}v${n}`}
                  </option>
                ))}
              </SelectField>
            )}
            <SelectField
              label={t("org.battles.gender")}
              error={errors.gender?.message}
              {...register("gender")}
            >
              <option value="bboy">{t("org.battles.genders.bboy")}</option>
              <option value="bgirl">{t("org.battles.genders.bgirl")}</option>
              <option value="mixed">{t("org.battles.genders.mixed")}</option>
            </SelectField>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
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
          </div>
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
            label={<OptionalLabel label={t("org.battles.name")} />}
            hint={t("org.battles.nameHint")}
            placeholder={defaultBattleName(body)}
            error={errors.name?.message}
            {...register("name")}
          />
        </div>
      )}
    </div>
  );
}
