import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { AuthShell } from "../features/auth/AuthShell";
import { useMailLanguage } from "../features/auth/codes";
import { GoogleSignIn } from "../features/auth/GoogleSignIn";
import { afterSignUp, safeNext, withNext } from "../features/auth/safeNext";
import { useLogIn } from "../features/auth/useMe";

export function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const logIn = useLogIn(next);
  const language = useMailLanguage();

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
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  const onSubmit = handleSubmit(async (body) => {
    try {
      const { data, error, response } = await api.POST("/api/auth/login", {
        body: { ...body, language },
      });
      if (data) return logIn(data);
      if (error?.error.code === "email_unverified") {
        // Right password, address not confirmed yet: the API has just mailed a new code. Confirming
        // it ends the sign-up, so the welcome step comes next, as after Create an account.
        navigate(withNext("/verify-email", afterSignUp(next)), {
          state: { email: body.email },
        });
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
        <Link
          to={withNext("/forgot-password", next)}
          // The address typed so far comes along, so it needn't be typed twice.
          state={{ email: watch("email") }}
          className="-mt-3 self-start text-body-sm font-bold text-primary-text underline"
        >
          {t("auth.login.forgot")}
        </Link>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </Button>
      </form>
      <GoogleSignIn next={next} />
    </AuthShell>
  );
}
