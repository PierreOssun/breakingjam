import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** A chosen value in a picker, with the ✕ that removes it (DESIGN.md §4.20). */
export function RemovableChip({
  name,
  onRemove,
  className = "",
  children,
}: {
  /** What the ✕ is named after; the chip's text unless `children` says more. */
  name: string;
  onRemove: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-raised pr-1 pl-3 text-body-sm font-bold ${className}`}
    >
      {children ?? name}
      <button
        type="button"
        aria-label={t("picker.remove", { name })}
        onClick={onRemove}
        className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-surface"
      >
        <X size={14} weight="bold" aria-hidden />
      </button>
    </span>
  );
}
