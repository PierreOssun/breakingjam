import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useId, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
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
import { ME_KEY } from "../auth/useMe";

type Organizer = Schemas["OrganizerResponse"];
type Values = {
  display_name: string;
  instagram_handle: string;
  country: string;
  city: string;
  bio: string;
};
const FIELDS = [
  "display_name",
  "instagram_handle",
  "country",
  "city",
  "bio",
] as const;

const valuesOf = (o: Organizer): Values => ({
  display_name: o.display_name,
  instagram_handle: o.instagram_handle ?? "",
  country: o.country ?? "",
  city: o.city ?? "",
  bio: o.bio ?? "",
});

/** Edit your organiser page; a new handle needs verifying again (M12c). */
export function OrganizerEditDialog({
  organizer,
  open,
  onClose,
  focusHandle = false,
}: {
  organizer: Organizer;
  open: boolean;
  onClose: () => void;
  focusHandle?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const schema = useMemo(
    () =>
      z.object({
        display_name: z
          .string()
          .trim()
          .min(1, t("validation.required"))
          .max(80, t("validation.tooLong", { max: 80 })),
        instagram_handle: z
          .string()
          .regex(/^[A-Za-z0-9._]{0,30}$/, t("validation.handle")),
        country: z.string(),
        city: z.string().max(100, t("validation.tooLong", { max: 100 })),
        bio: z.string().max(160, t("validation.tooLong", { max: 160 })),
      }),
    [t],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: valuesOf(organizer),
  });
  const { register, handleSubmit, setError, reset, watch } = form;
  const { errors, isDirty } = form.formState;
  // Each opening starts from the saved page. A layout effect, so the reset lands before
  // the dialog shows and can never wipe what was just typed into it.
  useLayoutEffect(() => {
    if (open) reset(valuesOf(organizer));
  }, [open, organizer, reset]);
  const countries = useMemo(
    () => countryOptions(i18n.language),
    [i18n.language],
  );
  const [handle, bio] = watch(["instagram_handle", "bio"]);
  const losesTick =
    organizer.verified_at != null &&
    handle.toLowerCase() !== (organizer.instagram_handle ?? "");

  const save = useMutation({
    mutationFn: (values: Values) =>
      api.PUT("/api/organizers/{id}", {
        params: { path: { id: organizer.id } },
        body: {
          display_name: values.display_name.trim(),
          instagram_handle: values.instagram_handle || null,
          country: values.country || null,
          city: values.city.trim() || null,
          bio: values.bio.trim() || null,
        },
      }),
    onSuccess: ({ data, error, response }) => {
      if (data) {
        queryClient.setQueryData(["organizer", organizer.id], data);
        void queryClient.invalidateQueries({
          queryKey: ["organizer", organizer.id, "claim"],
        });
        // The display name is the account's too.
        void queryClient.invalidateQueries({ queryKey: ME_KEY });
        toast({ kind: "success", message: t("organizer.saved") });
        onClose();
        return;
      }
      if (response.status === 409) {
        setError("instagram_handle", { message: t("organizer.handleTaken") });
        return;
      }
      const { fields, rest } = splitFieldErrors(error, FIELDS);
      for (const [field, message] of fields) setError(field, { message });
      if (rest) setError("root", { message: rest });
    },
    onError: () => setError("root", { message: t("errors.generic") }),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="form"
      title={t("organizer.edit")}
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
        onSubmit={handleSubmit((values) => save.mutate(values))}
      >
        <TextField
          label={t("organizer.name")}
          hint={t("organizer.nameHint")}
          data-autofocus={focusHandle ? undefined : true}
          error={errors.display_name?.message}
          {...register("display_name")}
        />
        <HandleField
          label={<OptionalLabel label={t("picker.instagram")} />}
          data-autofocus={focusHandle ? true : undefined}
          error={errors.instagram_handle?.message}
          {...register("instagram_handle", { setValueAs: toHandle })}
        />
        {losesTick && (
          <InlineNotice actionable>{t("organizer.newHandle")}</InlineNotice>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <SelectField
            label={<OptionalLabel label={t("org.fields.country")} />}
            {...register("country")}
          >
            <option value="">—</option>
            {countries.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextField
            label={<OptionalLabel label={t("org.fields.city")} />}
            error={errors.city?.message}
            {...register("city")}
          />
        </div>
        <TextAreaField
          label={<OptionalLabel label={t("dancerEdit.bio")} />}
          counter={{ length: bio.length, max: 160 }}
          error={errors.bio?.message}
          {...register("bio")}
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
