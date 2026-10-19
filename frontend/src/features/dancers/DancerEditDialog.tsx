import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useId, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { ChipInput } from "../../components/ChipInput";
import { Dialog } from "../../components/Dialog";
import { HandleField } from "../../components/HandleField";
import { InlineNotice } from "../../components/InlineNotice";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextAreaField } from "../../components/TextAreaField";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/useToast";
import { splitFieldErrors } from "../../lib/apiErrors";
import { countryOptions } from "../../lib/countries";
import { toHandle } from "../../lib/instagram";
import {
  type AvatarParts,
  DETAILS,
  formatParts,
  hasDetail,
  PARTS,
  partsOf,
} from "./avatarParts";
import { DancerAvatar } from "./DancerAvatar";

type Dancer = Schemas["DancerResponse"];
type Values = {
  dancer_name: string;
  aliases: string[];
  country: string;
  country2: string;
  city: string;
  instagram_handle: string;
  bio: string;
  parts: AvatarParts;
};
const FIELDS = [
  "dancer_name",
  "aliases",
  "country",
  "country2",
  "city",
  "instagram_handle",
  "bio",
] as const;

function valuesOf(dancer: Dancer): Values {
  return {
    dancer_name: dancer.dancer_name,
    aliases: dancer.aliases,
    country: dancer.country,
    country2: dancer.country2 ?? "",
    city: dancer.city ?? "",
    instagram_handle: dancer.instagram_handle ?? "",
    bio: dancer.bio ?? "",
    parts: partsOf(dancer),
  };
}

type DancerEditDialogProps = {
  dancer: Dancer;
  open: boolean;
  onClose: () => void;
  /** Opened from "Add Instagram": focus starts on the handle (§4.23). */
  focusHandle?: boolean;
};

/** The edit sheet (DESIGN.md §6): profile, flags, handle, bio and the avatar's parts. */
export function DancerEditDialog(props: DancerEditDialogProps) {
  const { dancer, open, onClose, focusHandle = false } = props;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const schema = useSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: valuesOf(dancer),
  });
  const { register, control, handleSubmit, setError, reset, watch } = form;
  const { errors, isDirty } = form.formState;
  // Each opening starts from the saved page. A layout effect, so the reset lands before
  // the dialog shows and can never wipe what was just typed into it.
  // Null parts mean nobody has drawn the dancer yet (a battle may then suggest a look); once
  // the picker is touched, the parts are a choice, even when they match the seed.
  const drawn = useRef(false);
  useLayoutEffect(() => {
    if (open) {
      reset(valuesOf(dancer));
      drawn.current = false;
    }
  }, [open, dancer, reset]);
  const countries = useMemo(
    () => countryOptions(i18n.language),
    [i18n.language],
  );
  const [parts, bio] = watch(["parts", "bio"]);

  const save = useMutation({
    mutationFn: (values: Values) =>
      api.PUT("/api/dancers/{id}", {
        params: { path: { id: dancer.id } },
        body: {
          dancer_name: values.dancer_name.trim(),
          aliases: values.aliases,
          // Not in the sheet; kept as it is.
          real_name: dancer.real_name ?? null,
          country: values.country,
          country2: values.country2 || null,
          city: values.city.trim() || null,
          instagram_handle: toHandle(values.instagram_handle) || null,
          bio: values.bio.trim() || null,
          avatar_parts:
            dancer.avatar_parts || drawn.current
              ? formatParts(values.parts)
              : null,
        },
      }),
    onSuccess: ({ data, error, response }) => {
      if (data) {
        queryClient.setQueryData(["dancer", dancer.id], data);
        toast({ kind: "success", message: t("dancerEdit.saved") });
        onClose();
        return;
      }
      if (response.status === 409) {
        setError("instagram_handle", { message: t("picker.handleTaken") });
        return;
      }
      const { fields, rest } = splitFieldErrors(error, FIELDS);
      for (const [field, message] of fields) setError(field, { message });
      if (rest) setError("root", { message: rest });
    },
    onError: () => setError("root", { message: t("errors.generic") }),
  });

  const countrySelect = (name: "country" | "country2", optional: boolean) => (
    <SelectField
      label={
        optional ? (
          <OptionalLabel label={t("dancerEdit.country2")} />
        ) : (
          t("dancerEdit.country")
        )
      }
      error={errors[name]?.message}
      {...register(name)}
    >
      <option value="">{optional ? "—" : t("org.fields.choose")}</option>
      {countries.map(([code, label]) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </SelectField>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="form"
      title={t("dancerEdit.title")}
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
      {!dancer.verified_at && (
        <InlineNotice>{t("dancerEdit.logged")}</InlineNotice>
      )}
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-6"
        onSubmit={handleSubmit((values) => save.mutate(values))}
      >
        <TextField
          label={t("picker.dancerName")}
          data-autofocus={focusHandle ? undefined : true}
          error={errors.dancer_name?.message}
          {...register("dancer_name")}
        />
        <Controller
          control={control}
          name="aliases"
          render={({ field }) => (
            <ChipInput
              label={<OptionalLabel label={t("dancerEdit.aliases")} />}
              values={field.value}
              onChange={field.onChange}
              max={5}
              hint={t("dancerEdit.aliasesHint")}
            />
          )}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          {countrySelect("country", false)}
          {countrySelect("country2", true)}
        </div>
        <TextField
          label={<OptionalLabel label={t("org.fields.city")} />}
          error={errors.city?.message}
          {...register("city")}
        />
        <HandleField
          label={<OptionalLabel label={t("picker.instagram")} />}
          data-autofocus={focusHandle ? true : undefined}
          error={errors.instagram_handle?.message}
          {...register("instagram_handle", { setValueAs: toHandle })}
        />
        <TextAreaField
          label={<OptionalLabel label={t("dancerEdit.bio")} />}
          counter={{ length: bio.length, max: 160 }}
          error={errors.bio?.message}
          {...register("bio")}
        />
        <AvatarPicker
          dancer={dancer}
          parts={parts}
          onChange={(next) => {
            drawn.current = true;
            form.setValue("parts", next, { shouldDirty: true });
          }}
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

/** The avatar's six parts as selects and its details as checkboxes, with a live preview (§4.16). */
function AvatarPicker({
  dancer,
  parts,
  onChange,
}: {
  dancer: Dancer;
  parts: AvatarParts;
  onChange: (parts: AvatarParts) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-label text-text uppercase">
        {t("dancerEdit.avatar")}
      </legend>
      <div className="flex items-center gap-4">
        <DancerAvatar
          dancer={{
            ...dancer,
            avatar_url: null,
            avatar_parts: formatParts(parts),
          }}
          size="form"
        />
        <p className="text-caption text-muted">{t("dancerEdit.avatarHint")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {PARTS.map(({ part, options }) => {
          const names: readonly string[] = t(
            `dancerEdit.parts.${part}.options`,
            {
              returnObjects: true,
            },
          );
          return (
            <SelectField
              key={part}
              label={t(`dancerEdit.parts.${part}.label`)}
              value={parts[part]}
              onChange={(e) =>
                onChange({ ...parts, [part]: Number(e.target.value) })
              }
            >
              {options.map((option, index) => (
                <option key={option} value={index}>
                  {names[index] ?? option}
                </option>
              ))}
            </SelectField>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {DETAILS.map(({ name, bit }) => (
          <label
            key={name}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-body"
          >
            <input
              type="checkbox"
              checked={hasDetail(parts, name)}
              onChange={(e) =>
                onChange({
                  ...parts,
                  details: e.target.checked
                    ? parts.details | bit
                    : parts.details & ~bit,
                })
              }
              className="size-5 accent-primary"
            />
            {t(`dancerEdit.parts.details.${name}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Mirrors `DancerFields` with the sheet's tighter limits (§4.20: 5 aliases, 160-char bio). */
function useSchema() {
  const { t } = useTranslation();
  return useMemo(
    () =>
      z.object({
        dancer_name: z
          .string()
          .trim()
          .min(1, t("validation.required"))
          .max(100, t("validation.tooLong", { max: 100 })),
        aliases: z.array(z.string()).max(5),
        country: z.string().regex(/^[A-Z]{2}$/, t("validation.required")),
        country2: z.string(),
        city: z.string().max(100, t("validation.tooLong", { max: 100 })),
        instagram_handle: z
          .string()
          .regex(/^[A-Za-z0-9._]{0,30}$/, t("validation.handle")),
        bio: z.string().max(160, t("validation.tooLong", { max: 160 })),
        parts: z.custom<AvatarParts>(),
      }),
    [t],
  );
}
