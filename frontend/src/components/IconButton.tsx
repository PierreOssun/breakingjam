import type { ReactNode } from "react";
import { Button } from "./Button";

/** A 44px ghost icon button, named by `label` since the icon is its only content (§4.1). */
export function IconButton({
  label,
  onClick,
  disabled,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 ${className}`}
    >
      {children}
    </Button>
  );
}
