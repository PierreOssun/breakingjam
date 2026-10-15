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
import { AuthShell } from "../features/auth/AuthShell";
import { safeNext, withNext } from "../features/auth/safeNext";
import { ME_KEY } from "../features/auth/useMe";

export function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Built with `t` so messages follow the current language.
  const schema = useMemo(
    () =>
      z.object({
        email: z.email(t("validation.email")),
        password: z.string().min(1, t("validation.required")),
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
      const { data, response } = await api.POST("/api/auth/login", { body });
      if (data) {
        queryClient.setQueryData(ME_KEY, data);
        navigate(next, { replace: true });
        return;
      }
      const message =
        response.status === 401
          ? t("auth.errors.invalidCredentials")
          : t("auth.errors.generic");
      setError("root", { message });
    } catch {
      setError("root", { message: t("auth.errors.generic") });
    }
  });

  const googleFailed = params.get("error") === "google";

  return (
    <AuthShell
      title={t("auth.login.title")}
      next={next}
      error={
        errors.root?.message ??
        (googleFailed ? t("auth.errors.google") : undefined)
      }
      footer={
        <>
          {t("auth.login.switchPrompt")}{" "}
          <Link
            to={withNext("/register", next)}
            className="font-bold text-primary-text underline"
          >
            {t("auth.login.switchLink")}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          label={t("auth.fields.email")}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label={t("auth.fields.password")}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
