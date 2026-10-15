import { ArrowSquareOut, Copy } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";
import { Dialog } from "../../components/Dialog";
import { InlineNotice } from "../../components/InlineNotice";
import { useToast } from "../../components/useToast";
import { copyText } from "../../lib/clipboard";
import { BREAKINGJAM_INSTAGRAM } from "../../lib/instagram";

// The account's DM thread; the OS hands it to the Instagram app.
const DM = `https://ig.me/m/${BREAKINGJAM_INSTAGRAM}`;

/** What the modal needs from a dancer or organiser claim. */
export type CodeClaim = { code: string; others_pending?: boolean };

/** The verify modal (DESIGN.md §6): the code, and where to put it. */
export function VerifyDialog({
  claim,
  open,
  onClose,
}: {
  claim: CodeClaim | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const copy = async () => {
    if (!claim) return;
    const copied = await copyText(claim.code);
    toast(
      copied
        ? { kind: "success", message: t("verify.copied") }
        : {
            kind: "info",
            message: t("verify.copyByHand", { code: claim.code }),
          },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("verify.title")}>
      <div className="flex flex-col gap-2 text-body text-muted">
        <p>{t("verify.how", { account: BREAKINGJAM_INSTAGRAM })}</p>
        <p>{t("verify.then")}</p>
      </div>
      {claim?.others_pending && (
        <InlineNotice actionable>{t("verify.othersPending")}</InlineNotice>
      )}
      {/* §4.19 code display: selectable, unambiguous characters. */}
      <div className="flex flex-col items-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong bg-bg p-[18px]">
        <span className="text-caption text-muted">{t("verify.yourCode")}</span>
        <span className="font-mono text-code-xl select-all">{claim?.code}</span>
      </div>
      {/* Primary first on phones; from lg a right-aligned row ending with it (§4.9). */}
      <div className="flex flex-col gap-3 lg:flex-row-reverse">
        <Button data-autofocus onClick={() => void copy()}>
          <Copy size={20} weight="bold" aria-hidden />
          {t("verify.copy")}
        </Button>
        <a
          href={DM}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("secondary", "md")}
        >
          {t("verify.openInstagram")}
          <ArrowSquareOut size={20} weight="bold" aria-hidden />
        </a>
        <Button variant="ghost" onClick={onClose}>
          {t("verify.done")}
        </Button>
      </div>
    </Dialog>
  );
}
