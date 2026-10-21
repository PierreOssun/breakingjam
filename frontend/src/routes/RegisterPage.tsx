import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { splitFieldErrors } from "../lib/apiErrors";
import { AuthShell } from "../features/auth/AuthShell";
import { safeNext, withNext } from "../features/auth/safeNext";
import { ME_KEY } from "../features/auth/useMe";

export function RegisterPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Mirrors `RegisterRequest` in the API; the server stays authoritative (§6 Forms).
  const schema = useMemo(
    () =>
      z.object({
        display_name: z
          .string()
          .trim()
          .min(1, t("validation.displayName"))
          .max(80, t("validation.displayName")),
        email: z.email(t("validation.email")),
        password: z
          .string()
          .min(8, t("validation.passwordLength"))
          .max(128, t("validation.passwordLength")),
      }),
    [t],
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  const onSubmit = handleSubmit(async (body) => {
    try {
      const { data, error, response } = await api.POST("/api/auth/register", {
        body,
      });
      if (data) {
        queryClient.setQueryData(ME_KEY, data);
        navigate(next, { replace: true });
        return;
      }
      if (response.status === 409) {
        setError("email", { message: t("auth.errors.emailTaken") });
        return;
      }
      // Rules the client missed go on their fields; anything else gets the generic message.
      const { fields } = splitFieldErrors(error, [
        "display_name",
        "email",
        "password",
      ] as const);
      for (const [name, message] of fields) setError(name, { message });
      if (fields.length === 0)
        setError("root", { message: t("auth.errors.generic") });
    } catch {
      setError("root", { message: t("auth.errors.generic") });
    }
  });

  return (
    <AuthShell
      title={t("auth.register.title")}
      next={next}
      error={errors.root?.message}
      footer={
        <>
          {t("auth.register.switchPrompt")}{" "}
          <Link
            to={withNext("/login", next)}
            className="font-bold text-primary-text underline"
          >
            {t("auth.register.switchLink")}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          label={t("auth.fields.displayName")}
          hint={t("auth.fields.displayNameHint")}
          autoComplete="nickname"
          error={errors.display_name?.message}
          {...register("display_name")}
        />
        <TextField
          label={t("auth.fields.email")}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label={t("auth.fields.password")}
          hint={t("auth.fields.passwordHint")}
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting
            ? t("auth.register.submitting")
            : t("auth.register.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
