import { Export } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

type ShareButtonProps = {
  title: string;
  /** What to share; the current page when unset. */
  url?: string;
  /** A secondary icon button, as in the map's bottom sheet (DESIGN.md §4.4). */
  iconOnly?: boolean;
};

/** The system share sheet where there is one, else copies the link and says so. */
export function ShareButton({
  title,
  url,
  iconOnly = false,
}: ShareButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const link = url ?? window.location.href;
    if (navigator.share) {
      // Closing the sheet rejects with AbortError; nothing to report.
      await navigator.share({ title, url: link }).catch(() => undefined);
      return;
    }
    // No clipboard outside secure contexts; a refused write is not a copy either.
    await navigator.clipboard?.writeText(link).then(
      () => setCopied(true),
      () => undefined,
    );
  }

  const icon = <Export size={iconOnly ? 20 : 16} weight="bold" aria-hidden />;
  if (iconOnly) {
    return (
      <Button
        variant="secondary"
        size="icon"
        aria-label={t("jam.share")}
        onClick={() => void share()}
      >
        {icon}
        <span className="sr-only" aria-live="polite">
          {copied ? t("jam.linkCopied") : ""}
        </span>
      </Button>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => void share()}>
      {icon}
      <span aria-live="polite">
        {copied ? t("jam.linkCopied") : t("jam.share")}
      </span>
    </Button>
  );
}
