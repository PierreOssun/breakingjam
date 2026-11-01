import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { z } from "zod";
import { api } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { FormError } from "../../components/FormError";
import { TextField } from "../../components/TextField";
import { applyFieldErrors } from "../../lib/apiErrors";
import { ME_KEY } from "../auth/useMe";
import { startBody } from "./jamFields";

type Values = { name: string; starts_on: string };
const FIELDS = ["name", "starts_on"] as const;

/** The start sheet (M24): a name and a first day make a draft, whose page opens in edit mode. */
export function StartJamDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formId = useId();
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("validation.required"))
          .max(200, t("validation.tooLong", { max: 200 })),
        starts_on: z.string().min(1, t("validation.required")),
      }),
    [t],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", starts_on: "" },
  });
  const { register, handleSubmit, setError } = form;
  const { errors, isSubmitting } = form.formState;

  const submit = handleSubmit(async (values) => {
    try {
      const { data, error } = await api.POST("/api/events", {
        body: startBody(values.name, values.starts_on),
      });
      if (!data) return applyFieldErrors(setError, error, FIELDS);
      // A first jam makes the account an organiser (§5 Auth).
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/org/jams/${data.id}/edit`, { replace: true });
    } catch {
      setError("root", { message: t("errors.generic") });
    }
  });

  return (
    <Dialog
      onClose={onClose}
      title={t("pages.orgJamNew")}
      action={{
        label: t("org.start.create"),
        form: formId,
        loading: isSubmitting,
      }}
    >
      <p className="text-body text-muted">{t("org.start.intro")}</p>
      <form
        id={formId}
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-6"
      >
        <TextField
          label={t("org.fields.name")}
          data-autofocus
          error={errors.name?.message}
          {...register("name")}
        />
        <TextField
          type="date"
          label={t("org.fields.startsOn")}
          error={errors.starts_on?.message}
          {...register("starts_on")}
        />
        <FormError message={errors.root?.message} />
        <p className="text-caption text-muted">{t("org.newIntro")}</p>
      </form>
    </Dialog>
  );
}
