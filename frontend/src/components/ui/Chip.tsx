import type { HTMLAttributes } from "react";
import { cn } from "./utils";

type ChipProps = HTMLAttributes<HTMLSpanElement>;

export function Chip({ className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-300/70 bg-slate-100 px-2.5 py-1 text-xs text-slate-600",
        className
      )}
      {...props}
    />
  );
}
