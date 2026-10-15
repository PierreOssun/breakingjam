import { Clock } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../components/useToast";
import { copyText } from "../../lib/clipboard";

/** §4.18: the claim waits for review; pressing it copies the code again. */
export function PendingPill({ code }: { code: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={async () => {
          const copied = await copyText(code);
          toast(
            copied
              ? { kind: "success", message: t("verify.copied") }
              : { kind: "info", message: t("verify.copyByHand", { code }) },
          );
        }}
        className="inline-flex h-11 cursor-pointer items-center gap-2.5 self-start rounded-full border-[1.5px] border-dashed border-accent-text bg-accent/10 pr-1.5 pl-4 text-body-sm font-extrabold text-accent-text"
      >
        <Clock size={16} weight="bold" aria-hidden />
        {t("verify.pending")}
        <span className="inline-flex h-8 items-center rounded-full bg-bg px-3 font-mono font-bold tracking-[0.08em] text-text">
          {code}
        </span>
      </button>
      <p className="text-caption text-muted">{t("verify.byHand")}</p>
    </div>
  );
}
