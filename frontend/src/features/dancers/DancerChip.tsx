import { Plus, X } from "@phosphor-icons/react";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { DancerAvatar } from "./DancerAvatar";

type DancerChipProps = {
  dancer: Schemas["DancerRef"];
  /** For the jam's organiser: a remove button named by `label`. */
  remove?: { label: string; onClick: () => void; disabled?: boolean };
};

/** A link chip to a dancer page, with their avatar (DESIGN.md §4.12). */
export function DancerChip({ dancer, remove }: DancerChipProps) {
  return (
    <span className="relative inline-flex h-9 items-center rounded-full border border-border-strong text-body-sm font-bold text-text">
      <Link
        to={`/dancers/${dancer.id}`}
        className={`inline-flex h-full items-center gap-2 rounded-full pl-1 transition-colors duration-fast hover:bg-surface-raised ${remove ? "pr-2" : "pr-3.5 after:absolute after:-inset-1 after:content-['']"}`}
      >
        {/* The name says who it is; the avatar is decoration here. */}
        <span aria-hidden className="inline-flex">
          <DancerAvatar dancer={dancer} size="chip" />
        </span>
        {dancer.dancer_name}
      </Link>
      {remove && (
        <button
          type="button"
          aria-label={remove.label}
          disabled={remove.disabled}
          onClick={remove.onClick}
          className="mr-1 grid size-7 cursor-pointer place-items-center rounded-full hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      )}
    </span>
  );
}

/** A chip-shaped button that adds someone, for the jam's organiser (DESIGN.md §4.12). */
export function AddChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 text-body-sm font-bold text-text transition-colors duration-fast after:absolute after:-inset-1 after:content-[''] hover:bg-surface-raised"
    >
      <Plus size={16} weight="bold" aria-hidden />
      {label}
    </button>
  );
}
