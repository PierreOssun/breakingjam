import { Export } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { copyText } from "../lib/clipboard";
import { Button } from "./Button";
import { useToast } from "./useToast";

type ShareButtonProps = {
  /** What the share sheet titles it, e.g. "Paris Cypher · Sat 14 Nov · Paris". */
  title: string;
  /** What to share; the current page when unset. */
  url?: string;
  /** `icon`: a secondary icon button (map sheet, the jam page's top bar on phones) ·
   * `ghost`: a small text button (top bars) · `secondary`: a full button, e.g. the action bar's. */
  look?: "icon" | "ghost" | "secondary";
  /** The text of `ghost` and `secondary` buttons; "Share" when unset. */
  label?: string;
  className?: string;
};

/** The system share sheet where there is one, else copies the link and says so in a toast (§4.8). */
export function ShareButton({
  title,
  url,
  look = "ghost",
  label,
  className = "",
}: ShareButtonProps) {
  const { t } = useTranslation();
  const toast = useToast();

  async function share() {
    const link = url ?? window.location.href;
    if (navigator.share) {
      // Closing the sheet rejects with AbortError; nothing to report.
      await navigator.share({ title, url: link }).catch(() => undefined);
      return;
    }
    if (await copyText(link))
      toast({ kind: "success", message: t("jam.linkCopied") });
  }

  if (look === "icon") {
    return (
      <Button
        variant="secondary"
        size="icon"
        aria-label={t("jam.share")}
        onClick={() => void share()}
        className={className}
      >
        <Export size={20} weight="bold" aria-hidden />
      </Button>
    );
  }
  return (
    <Button
      variant={look}
      size={look === "ghost" ? "sm" : "md"}
      onClick={() => void share()}
      className={className}
    >
      <Export size={look === "ghost" ? 16 : 20} weight="bold" aria-hidden />
      {label ?? t("jam.share")}
    </Button>
  );
}
