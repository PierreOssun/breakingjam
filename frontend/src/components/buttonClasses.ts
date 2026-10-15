export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

// DESIGN.md §4.1. Hover styles skip disabled buttons; links are never `:disabled`.
const base =
  "inline-flex items-center justify-center gap-2 rounded-full border-2 font-body font-bold whitespace-nowrap transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-primary bg-primary text-on-primary not-disabled:hover:border-primary-hover not-disabled:hover:bg-primary-hover not-disabled:active:translate-y-px",
  secondary:
    "border-text bg-transparent text-text not-disabled:hover:bg-text not-disabled:hover:text-bg",
  ghost:
    "border-transparent bg-transparent text-text not-disabled:hover:bg-surface-raised not-disabled:active:bg-border",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-11 px-[18px] text-body-sm",
  md: "h-12 px-6 text-body",
  lg: "h-14 px-8 text-[18px]",
  icon: "size-11 p-0",
};

/** Button classes, also for links that look like buttons. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
) {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}
