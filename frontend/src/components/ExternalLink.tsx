import type { ReactNode } from "react";

/** An underlined link to another site, opened in a new tab. */
export function ExternalLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-bold text-primary-text underline ${className}`}
    >
      {children}
    </a>
  );
}
