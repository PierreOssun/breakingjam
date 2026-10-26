import type { ReactNode } from "react";

const shape =
  "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-caption font-bold whitespace-nowrap";

/** Category of a battle, e.g. "1v1 Bboy": sentence case, not interactive (DESIGN.md §4.11). */
export function MetaTag({ children }: { children: ReactNode }) {
  return (
    <span className={`${shape} border-border text-muted`}>{children}</span>
  );
}

/** What a dancer did at a jam when not competing: Judge, DJ, MC, Host. */
export function RoleTag({ children }: { children: ReactNode }) {
  return (
    <span
      className={`${shape} border-accent-text bg-accent/[.14] text-accent-text`}
    >
      {children}
    </span>
  );
}
