import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { RESEND_SECONDS } from "./codes";

/**
 * "Resend the code", counting down the minute the API waits between codes: first from `wait`
 * seconds (a full minute when a code has just gone out), then a minute after each new one. Says
 * so once a new one is sent.
 */
export function ResendButton({
  onResend,
  wait = RESEND_SECONDS,
}: {
  onResend: () => Promise<boolean>;
  wait?: number;
}) {
  const { t } = useTranslation();
  const [until, setUntil] = useState(() => Date.now() + wait * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [sends, setSends] = useState(0);
  const [busy, setBusy] = useState(false);
  // Ticks only while counting down: an idle button doesn't re-render.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setNow(now);
      if (now >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));

  async function resend() {
    setBusy(true);
    const done = await onResend();
    setBusy(false);
    if (!done) return;
    setSends((n) => n + 1);
    setUntil(Date.now() + RESEND_SECONDS * 1000);
    setNow(Date.now());
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={left > 0}
        loading={busy}
        onClick={() => void resend()}
      >
        {left > 0
          ? t("auth.code.resendIn", { seconds: left })
          : t("auth.code.resend")}
      </Button>
      <p aria-live="polite" className="text-body-sm text-muted">
        {/* A new node per code, so screen readers announce the same words again. */}
        {sends > 0 && <span key={sends}>{t("auth.code.resent")}</span>}
      </p>
    </div>
  );
}
