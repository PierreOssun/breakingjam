import { ArrowRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { DancerAvatar } from "../dancers/DancerAvatar";
import type { whoIsIn } from "./jamDetail";

/** The first six faces, who is in and the lineup; a link down to the battles (DESIGN.md §4.31).
 * Nothing when nobody is listed yet. */
export function WhosIn({ who }: { who: ReturnType<typeof whoIsIn> }) {
  const { t } = useTranslation();
  const faces = who.dancers.length > 0 ? who.dancers : who.staff;
  if (faces.length === 0) return null;
  // One DJ is named ("DJ Krate", or just "DJ Spin" when it says so); several are counted.
  const named = (people: typeof who.djs, role: "dj" | "mc") => {
    const [only] = people;
    if (people.length > 1)
      return t(`jam.whosIn.${role}s`, { count: people.length });
    if (!only) return null;
    return new RegExp(`^${role}\\b`, "i").test(only.dancer_name)
      ? only.dancer_name
      : t(`jam.whosIn.${role}`, { name: only.dancer_name });
  };
  const lineup = [
    who.judges.length > 0 &&
      t("jam.whosIn.judges", { count: who.judges.length }),
    named(who.djs, "dj"),
    named(who.mcs, "mc"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <a
      href={who.dancers.length > 0 ? "#battles" : "#lineup"}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors duration-fast hover:border-border-strong"
    >
      <span aria-hidden className="flex shrink-0 -space-x-2.5">
        {faces.slice(0, 6).map((dancer) => (
          <span key={dancer.id} className="rounded-[10px] ring-2 ring-bg">
            <DancerAvatar dancer={dancer} size="stack" />
          </span>
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-sm font-extrabold">
          {who.dancers.length > 0
            ? t("jam.whosIn.dancers", { count: who.dancers.length })
            : t("jam.whosIn.noDancers")}
        </span>
        {lineup && <span className="text-body-sm text-muted">{lineup}</span>}
      </span>
      <ArrowRight
        size={20}
        weight="bold"
        aria-hidden
        className="shrink-0 text-muted"
      />
    </a>
  );
}
