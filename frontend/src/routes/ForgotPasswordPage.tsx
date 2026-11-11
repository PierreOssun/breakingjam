import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router";
import { z } from "zod";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { AuthShell, BackToLogin } from "../features/auth/AuthShell";
import { CodeField } from "../features/auth/CodeField";
import {
  codeSchema,
  showCodeErrors,
  useMailLanguage,
  type CodeState,
} from "../features/auth/codes";
import { ResendButton } from "../features/auth/ResendButton";
import { safeNext } from "../features/auth/safeNext";
import { useLogIn, useMe } from "../features/auth/useMe";

/**
 * "/forgot-password": an email, then the code it receives and a new password on the same page
 * (M27). Setting it logs in, then goes to `next`.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const typed = (useLocation().state as CodeState)?.email;
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const language = useMailLanguage();
  // Logged in, from the account page: the same code flow, worded as a change, not a rescue.
  const changing = Boolean(useMe().data);

  /** Asks for a code; the API answers the same whether the account exists or not. */
  async function send(email: string) {
    const { response } = await api
      .POST("/api/auth/password/forgot", { body: { email, language } })
      .catch(() => ({ response: undefined }));
    setError(response?.ok ? undefined : t("auth.errors.generic"));
    return Boolean(response?.ok);
  }

  return (
    <AuthShell
      title={t(changing ? "auth.forgot.changeTitle" : "auth.forgot.title")}
      error={error}
      footer={
        changing ? (
          <Link to={next} className="font-bold text-primary-text underline">
            {t("form.cancel")}
          </Link>
        ) : (
          <BackToLogin next={next} />
        )
      }
    >
      {sentTo === null ? (
        <EmailForm
          initial={typed ?? ""}
          intro={t(changing ? "auth.forgot.changeIntro" : "auth.forgot.intro")}
          onSend={async (email) => {
            if (await send(email)) setSentTo(email);
          }}
        />
      ) : (
        <>
          <p className="text-body text-muted">
            {t("auth.forgot.sentTo", { email: sentTo })}
          </p>
          <ResetForm email={sentTo} next={next} onError={setError} />
          <ResendButton onResend={() => send(sentTo)} />
        </>
      )}
    </AuthShell>
  );
}

/** The address to send the code to. */
function EmailForm({
  initial,
  intro,
  onSend,
}: {
  initial: string;
  intro: string;
  onSend: (email: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const schema = useMemo(
    () => z.object({ email: z.email(t("validation.email")) }),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: initial },
  });
  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ email }) => onSend(email))}
      className="flex flex-col gap-6"
    >
      <p className="text-body text-muted">{intro}</p>
      <TextField
        label={t("auth.fields.email")}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Button type="submit" className="w-full" loading={isSubmitting}>
        {t("auth.forgot.send")}
      </Button>
    </form>
  );
}

/** The code and the new password; setting it logs in. */
function ResetForm({
  email,
  next,
  onError,
}: {
  email: string;
  next: string;
  /** Sets the page's banner; `undefined` clears it. */
  onError: (message: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const logIn = useLogIn(next);
  // Mirrors `ResetPasswordRequest`; the API stays the judge.
  const schema = useMemo(
    () =>
      z.object({
        code: codeSchema(t),
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

  const onSubmit = handleSubmit(async ({ code, password }) => {
    // A banner from an earlier attempt no longer applies.
    onError(undefined);
    try {
      const { data, error } = await api.POST("/api/auth/password/reset", {
        body: { email, code, password },
      });
      if (data) return logIn(data);
      if (!showCodeErrors(setError, error, ["code", "password"], t))
        onError(t("auth.errors.generic"));
    } catch {
      onError(t("auth.errors.generic"));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      <CodeField autoFocus error={errors.code?.message} {...register("code")} />
      <TextField
        label={t("auth.forgot.newPassword")}
        hint={t("auth.fields.passwordHint")}
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Button type="submit" className="w-full" loading={isSubmitting}>
        {t("auth.forgot.submit")}
      </Button>
    </form>
  );
}
