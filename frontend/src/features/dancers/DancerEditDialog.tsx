import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api, type Schemas } from "../../api/client";
import { ChipInput } from "../../components/ChipInput";
import { CountrySelect } from "../../components/CountrySelect";
import { Dialog } from "../../components/Dialog";
import { FormError } from "../../components/FormError";
import { HandleField } from "../../components/HandleField";
import { InlineNotice } from "../../components/InlineNotice";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextAreaField } from "../../components/TextAreaField";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/useToast";
import { applyFieldErrors } from "../../lib/apiErrors";
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
  onClose: () => void;
  /** Opened from "Add Instagram": focus starts on the handle (§4.23). */
  focusHandle?: boolean;
};

/** The edit sheet (DESIGN.md §6): profile, flags, handle, bio and the avatar's parts. */
export function DancerEditDialog({
  dancer,
  onClose,
  focusHandle = false,
}: DancerEditDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const schema = useSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: valuesOf(dancer),
  });
  const { register, control, handleSubmit, setError, watch } = form;
  const { errors, isDirty } = form.formState;
  // Null parts mean nobody has drawn the dancer yet (a battle may then suggest a look); once
  // the picker is touched, the parts are a choice, even when they match the seed.
  const drawn = useRef(false);
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
      } else if (response.status === 409) {
        setError("instagram_handle", { message: t("picker.handleTaken") });
      } else {
        applyFieldErrors(setError, error, FIELDS);
      }
    },
    onError: () => setError("root", { message: t("errors.generic") }),
  });

  return (
    <Dialog
      onClose={onClose}
      size="form"
      title={t("dancerEdit.title")}
      confirmClose={isDirty ? t("form.discard") : undefined}
      action={{ label: t("form.save"), form: formId, loading: save.isPending }}
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
          <CountrySelect
            label={t("dancerEdit.country")}
            blank={t("org.fields.choose")}
            error={errors.country?.message}
            {...register("country")}
          />
          <CountrySelect
            label={<OptionalLabel label={t("dancerEdit.country2")} />}
            error={errors.country2?.message}
            {...register("country2")}
          />
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
        <FormError message={errors.root?.message} />
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
