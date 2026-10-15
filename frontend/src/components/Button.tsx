import { CircleNotch } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonClasses";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks while keeping the colour (§4.1 Loading). */
  loading?: boolean;
};

export function Button({
  variant,
  size,
  loading = false,
  className = "",
  children,
  onClick,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) event.preventDefault();
        else onClick?.(event);
      }}
      className={`${buttonClasses(variant, size)} ${loading ? "cursor-progress" : ""} ${className}`}
      {...props}
    >
      {loading && (
        <CircleNotch
          size={20}
          weight="bold"
          className="motion-safe:animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
