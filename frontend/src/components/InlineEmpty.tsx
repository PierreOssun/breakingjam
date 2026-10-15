import type { ReactNode } from "react";

/** One sentence in a dashed box for an empty section (DESIGN.md §4.22). */
export function InlineEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border-strong px-[18px] py-4 text-body-sm text-muted">
      {children}
    </p>
  );
}
