import type { HTMLAttributes } from "react";
import { cn } from "./utils";

type BadgeVariant = "neutral" | "progress" | "success" | "warning";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-slate-300 bg-slate-100 text-slate-700",
  progress: "border-blue-300 bg-blue-50 text-blue-700",
  success: "border-green-300 bg-green-50 text-green-700",
  warning: "border-amber-300 bg-amber-50 text-amber-700",
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export type { BadgeVariant };
