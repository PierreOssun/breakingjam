import { useTranslation } from "react-i18next";
import type { Schemas } from "../api/client";
import { resultOf } from "../features/jams/result";

const SIZES = {
  md: "h-7 min-w-[60px] px-2.5",
  // Inside a dancer chip (§4.12).
  sm: "h-6 px-2",
};

/** 1st / 2nd / 3rd filled, Top N outlined, Prelims muted; nothing when unknown (DESIGN.md §4.13). */
export function ResultBadge({
  finalRank,
  reached,
  size = "md",
}: {
  finalRank?: number | null;
  reached?: Schemas["BracketStage"] | null;
  size?: keyof typeof SIZES;
}) {
  const { t } = useTranslation();
  const result = resultOf(finalRank, reached);
  if (!result) return null;
  const base = `inline-flex shrink-0 items-center justify-center rounded-full text-caption font-extrabold ${SIZES[size]}`;
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
