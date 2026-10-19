import {
  Check,
  HourglassMedium,
  Lock,
  PencilSimple,
  X,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../api/client";

const STYLES: Record<Schemas["EventStatus"], string> = {
  draft: "border-dashed border-border-strong text-muted",
  in_review: "border-primary-text bg-primary/[.12] text-primary-text",
  published: "border-success bg-success/[.12] text-success",
  registration_closed: "border-accent-text bg-accent/[.15] text-accent-text",
  completed: "border-border bg-surface-raised text-muted",
  cancelled: "border-danger bg-danger/[.12] text-danger",
};

function StatusIcon({ status }: { status: Schemas["EventStatus"] }) {
  const props = { size: 14, weight: "bold" as const, "aria-hidden": true };
  switch (status) {
    case "draft":
      return <PencilSimple {...props} />;
    case "in_review":
      return <HourglassMedium {...props} />;
    case "published":
      return <span aria-hidden className="size-2 rounded-full bg-current" />;
    case "registration_closed":
      return <Lock {...props} />;
    case "completed":
      return <Check {...props} />;
    case "cancelled":
      return <X {...props} />;
  }
}

/** Jam status with icon and text; colour is never the only cue (DESIGN.md §4.5). */
export function StatusBadge({ status }: { status: Schemas["EventStatus"] }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 self-start rounded-full border px-2.5 text-caption font-bold tracking-[0.04em] uppercase ${STYLES[status]}`}
    >
      <StatusIcon status={status} />
      {t(`status.${status}`)}
    </span>
  );
}

/** The badge on a public card, only when the status matters to a visitor (DESIGN.md §4.3). */
export function CardStatus({ status }: { status: Schemas["EventStatus"] }) {
  if (status !== "registration_closed" && status !== "cancelled") return null;
  return <StatusBadge status={status} />;
}
