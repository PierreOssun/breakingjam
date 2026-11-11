import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { buttonClasses } from "../../components/buttonClasses";
import { useMediaQuery } from "../../lib/useMediaQuery";

/**
 * A row of landing cards: one scrolling row below lg, bleeding to the screen's edges; a grid
 * from lg, whose columns the section adds.
 */
export const SECTION_ROW =
  "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0";

type LandingSectionProps = {
  id: string;
  title: string;
  /** The line under the title, and its shorter form below lg. */
  sub?: ReactNode;
  subShort?: ReactNode;
  /** The link on the right; `short` is its label below lg. */
  link: { to: string; label: string; short: string };
  children: ReactNode;
};

/** A landing section under a hairline: title, sub line and link, then its cards (§6 Landing). */
export function LandingSection({
  id,
  title,
  sub,
  subShort = sub,
  link,
  children,
}: LandingSectionProps) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const line = wide ? sub : subShort;
  return (
    <section
      aria-labelledby={id}
      className="border-t border-border py-7 lg:py-16"
    >
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 md:px-6 lg:gap-8 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id={id}
              className="font-display text-[24px] leading-[30px] font-extrabold tracking-[-0.01em] lg:text-[36px] lg:leading-[42px] lg:tracking-[-0.02em]"
            >
              {title}
            </h2>
            {line && <p className="text-body-sm text-muted">{line}</p>}
          </div>
          <Link
            to={link.to}
            className={`${buttonClasses("ghost", "sm")} shrink-0 max-lg:px-2 max-lg:text-primary-text`}
          >
            {wide ? link.label : link.short}
            {wide && <ArrowRight size={16} weight="bold" aria-hidden />}
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}
