import { useTranslation } from "react-i18next";
import type { Schemas } from "../api/client";
import { resultOf } from "../features/jams/result";

const base =
  "inline-flex h-7 min-w-[60px] shrink-0 items-center justify-center rounded-full px-2.5 text-caption font-extrabold";

/** 1st / 2nd / 3rd filled, Top N outlined, Prelims muted; nothing when unknown (DESIGN.md §4.13). */
export function ResultBadge({
  finalRank,
  reached,
}: {
  finalRank?: number | null;
  reached?: Schemas["BracketStage"] | null;
}) {
  const { t } = useTranslation();
  const result = resultOf(finalRank, reached);
  if (!result) return null;
  if (result.kind === "podium") {
    const label = {
      1: t("result.rank1"),
      2: t("result.rank2"),
      3: t("result.rank3"),
    }[result.rank ?? 1];
    return (
      <span className={`${base} bg-primary text-on-primary`}>{label}</span>
    );
  }
  if (result.kind === "top") {
    return (
      <span
        className={`${base} border-[1.5px] border-primary-text text-primary-text`}
      >
        {t("result.top", { n: result.top })}
      </span>
    );
  }
  return (
    <span className={`${base} border border-border text-muted`}>
      {t("result.prelims")}
    </span>
  );
}
