import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** A grey block holding the place of content that is loading (DESIGN.md §4.29). Its size
 * and radius come in `className`: a default radius would win over theirs in Tailwind's order. */
export function Skeleton({ className }: { className: string }) {
  return (
    <span
      className={`block bg-surface-raised motion-safe:animate-pulse ${className}`}
    />
  );
}

/** Placeholders for one loading region, laid out by `className`: screen readers hear
 * "Loading…" once, not the shapes. */
export function Loading({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true">
      <span className="sr-only">{t("skeleton.loading")}</span>
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}

/** The shape of a jam or person row (§4.14, §4.25): the 52px lead and two lines of text. */
export function RowSkeleton() {
  return (
    <div className="flex min-h-[76px] items-center gap-3.5 border-b border-border py-3">
      <Skeleton className="rounded-md h-14 w-[52px] shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="rounded-md h-4 w-1/2" />
        <Skeleton className="rounded-md h-3 w-1/3" />
      </div>
    </div>
  );
}

/** A list of jam or person rows while it loads. */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Loading>
      {Array.from({ length: rows }, (_, i) => (
        <RowSkeleton key={i} />
      ))}
    </Loading>
  );
}
