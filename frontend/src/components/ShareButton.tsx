import { Export } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

/** The system share sheet where there is one, else copies the link and says so. */
export function ShareButton({ title }: { title: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      // Closing the sheet rejects with AbortError; nothing to report.
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    // No clipboard outside secure contexts; a refused write is not a copy either.
    await navigator.clipboard?.writeText(url).then(
      () => setCopied(true),
      () => undefined,
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void share()}>
      <Export size={16} weight="bold" aria-hidden />
      <span aria-live="polite">
        {copied ? t("jam.linkCopied") : t("jam.share")}
      </span>
    </Button>
  );
}
