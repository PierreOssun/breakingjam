import { Info } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** One line of context in a form or dialog; not an alert, so no colour fill (DESIGN.md §4.21). */
export function InlineNotice({
  children,
  actionable = false,
}: {
  children: ReactNode;
  /** The icon turns `accent-text` when the notice changes what the user should do. */
  actionable?: boolean;
}) {
  return (
    <p className="flex items-start gap-2.5 rounded-md bg-surface-raised px-3.5 py-3 text-[13px] leading-[18px] text-muted">
      <Info
        size={18}
        weight="bold"
        aria-hidden
        className={`shrink-0 ${actionable ? "text-accent-text" : ""}`}
      />
      <span>{children}</span>
    </p>
  );
}
