import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api, type Schemas } from "../../api/client";
import { CountrySelect } from "../../components/CountrySelect";
import { Dialog } from "../../components/Dialog";
import { FormError } from "../../components/FormError";
import { HandleField } from "../../components/HandleField";
import { InlineNotice } from "../../components/InlineNotice";
import { OptionalLabel } from "../../components/OptionalLabel";
import { TextAreaField } from "../../components/TextAreaField";
import { TextField } from "../../components/TextField";
import { useToast } from "../../components/useToast";
import { applyFieldErrors } from "../../lib/apiErrors";
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
  onClose,
  focusHandle = false,
}: {
  organizer: Organizer;
  onClose: () => void;
  /** Opened from "Add Instagram": focus starts on the handle (§4.23). */
  focusHandle?: boolean;
}) {
  const { t } = useTranslation();
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
  const { register, handleSubmit, setError, watch } = form;
  const { errors, isDirty } = form.formState;
  const [handle, bio] = watch(["instagram_handle", "bio"]);
  // Instagram handles are case-insensitive: a change of case is not a new handle.
  const losesTick =
    organizer.verified_at != null &&
    handle.toLowerCase() !== (organizer.instagram_handle ?? "").toLowerCase();

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
      } else if (response.status === 409) {
        setError("instagram_handle", { message: t("organizer.handleTaken") });
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
      title={t("organizer.edit")}
      confirmClose={isDirty ? t("form.discard") : undefined}
      action={{ label: t("form.save"), form: formId, loading: save.isPending }}
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
          <CountrySelect
            label={<OptionalLabel label={t("org.fields.country")} />}
            {...register("country")}
          />
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
        <FormError message={errors.root?.message} />
      </form>
    </Dialog>
  );
}
