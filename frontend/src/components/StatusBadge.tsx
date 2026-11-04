import {
  Check,
  HourglassMedium,
  Lock,
  PencilSimple,
  X,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../api/client";
import { CountdownChip } from "../features/jams/CountdownChip";

type Jam = { status: Schemas["EventStatus"]; phase: Schemas["Phase"] };
/** What the badge says: the status, or `past` for a public jam that is over. */
type Badge = Schemas["EventStatus"] | "past";

const STYLES: Record<Badge, string> = {
  draft: "border-dashed border-border-strong text-muted",
  in_review: "border-primary-text bg-primary/[.12] text-primary-text",
  published: "border-success bg-success/[.12] text-success",
  registration_closed: "border-accent-text bg-accent/[.15] text-accent-text",
  past: "border-border bg-surface-raised text-muted",
  cancelled: "border-danger bg-danger/[.12] text-danger",
};

/** A jam is over by its dates (`phase`), whatever status it was left in. */
function badgeOf({ status, phase }: Jam): Badge {
  const announced = status === "published" || status === "registration_closed";
  return announced && phase === "past" ? "past" : status;
}

function StatusIcon({ badge }: { badge: Badge }) {
  const props = { size: 14, weight: "bold" as const, "aria-hidden": true };
  switch (badge) {
    case "draft":
      return <PencilSimple {...props} />;
    case "in_review":
      return <HourglassMedium {...props} />;
    case "published":
      return <span aria-hidden className="size-2 rounded-full bg-current" />;
    case "registration_closed":
      return <Lock {...props} />;
    case "past":
      return <Check {...props} />;
    case "cancelled":
      return <X {...props} />;
  }
}

/** Jam status with icon and text; colour is never the only cue (DESIGN.md §4.5). */
export function StatusBadge({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const badge = badgeOf(jam);
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 self-start rounded-full border px-2.5 text-caption font-bold tracking-[0.04em] uppercase ${STYLES[badge]}`}
    >
      <StatusIcon badge={badge} />
      {t(`status.${badge}`)}
    </span>
  );
}

/** The badge on a public card, only when it matters to a visitor (DESIGN.md §4.3): live now,
 * registration closed or cancelled. */
export function CardStatus({ jam }: { jam: Jam }) {
  if (jam.status === "cancelled") return <StatusBadge jam={jam} />;
  if (jam.phase === "live") return <CountdownChip value={{ key: "live" }} />;
  if (jam.status === "registration_closed" && jam.phase === "upcoming")
    return <StatusBadge jam={jam} />;
  return null;
}
