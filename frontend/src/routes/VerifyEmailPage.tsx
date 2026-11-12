import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router";
import { z } from "zod";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { AuthShell, BackToLogin } from "../features/auth/AuthShell";
import { CodeField } from "../features/auth/CodeField";
import {
  authFailure,
  codeSchema,
  RESEND_SECONDS,
  showCodeErrors,
  useMailLanguage,
  type CodeState,
} from "../features/auth/codes";
import { ResendButton } from "../features/auth/ResendButton";
import { safeNext } from "../features/auth/safeNext";
import { useLogIn } from "../features/auth/useMe";

/** "/verify-email": the 6-digit code that confirms the address and logs in (M27), then `next`. */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const sentTo = (useLocation().state as CodeState)?.email;
  const logIn = useLogIn(next);
  const language = useMailLanguage();

  const schema = useMemo(
    () =>
      z.object({ email: z.email(t("validation.email")), code: codeSchema(t) }),
    [t],
  );
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onTouched",
    // Opened directly (typed, bookmarked, a new tab) there is no state: the field asks for the address.
    defaultValues: { email: sentTo ?? "", code: "" },
  });

  const onSubmit = handleSubmit(async (body) => {
    try {
      const { data, error, response } = await api.POST(
        "/api/auth/email/verify",
        { body },
      );
      if (data) return logIn(data);
      if (!showCodeErrors(setError, error, ["email", "code"], t))
        setError("root", { message: authFailure(t, response.status) });
    } catch {
      setError("root", { message: t("auth.errors.generic") });
    }
  });

  async function resend() {
    if (!(await trigger("email"))) return false;
    const { response } = await api
      .POST("/api/auth/email/resend", {
        body: { email: getValues("email"), language },
      })
      .catch(() => ({ response: undefined }));
    if (response?.ok) {
      clearErrors("root");
      return true;
    }
    setError("root", { message: authFailure(t, response?.status) });
    return false;
  }

  return (
    <AuthShell
      title={t("auth.code.title")}
      error={errors.root?.message}
      footer={<BackToLogin next={next} />}
    >
      <p className="text-body text-muted">
        {sentTo
          ? t("auth.code.sentTo", { email: sentTo })
          : t("auth.code.askEmail")}
      </p>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        <TextField
          label={t("auth.fields.email")}
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <CodeField
          // Focus lands here: the address is already filled in when sign-up led here.
          autoFocus={Boolean(sentTo)}
          error={errors.code?.message}
          {...register("code")}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t("auth.code.submit")}
        </Button>
      </form>
      {/* A code went out just now only when sign-up or log-in led here. */}
      <ResendButton onResend={resend} wait={sentTo ? RESEND_SECONDS : 0} />
    </AuthShell>
  );
}
