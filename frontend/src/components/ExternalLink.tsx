import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * A link to another site, opened in a new tab: underlined in running text, or a fact row's
 * 44px target with the arrow after it.
 */
export function ExternalLink({
  href,
  variant = "inline",
  className = "",
  children,
}: {
  href: string;
  variant?: "inline" | "fact";
  className?: string;
  children: ReactNode;
}) {
  const look =
    variant === "fact"
      ? "inline-flex min-h-11 items-center gap-1.5 self-start underline-offset-2 hover:underline"
      : "underline";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-bold text-primary-text ${look} ${className}`}
    >
      {children}
      {variant === "fact" && (
        <ArrowSquareOut size={16} weight="bold" aria-hidden />
      )}
    </a>
  );
}
