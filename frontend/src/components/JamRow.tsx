import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../api/client";
import { formatDateRange } from "../lib/dates";
import { DateBlock } from "./DateBlock";
import { Flag } from "./Flag";

/** A jam as a list row (DESIGN.md §4.14): date block, name, flag and city, then `trailing`. */
export function JamRow({
  jam,
  to,
  trailing,
}: {
  jam: Pick<
    Schemas["EventRef"],
    "name" | "starts_on" | "ends_on" | "city" | "country"
  >;
  to: string;
  trailing?: ReactNode;
}) {
  const { i18n } = useTranslation();
  return (
    <Link
      to={to}
      className="flex min-h-[76px] items-center gap-3.5 border-b border-border py-3 transition-colors duration-fast hover:bg-surface"
    >
      <DateBlock date={jam.starts_on} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-body font-extrabold">
          {jam.name}
          <span className="sr-only">
            , {formatDateRange(jam.starts_on, jam.ends_on, i18n.language)}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
          <Flag code={jam.country} size="bare" />
          {jam.city}
        </span>
      </span>
      {trailing}
    </Link>
  );
}
