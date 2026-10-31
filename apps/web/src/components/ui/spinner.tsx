import type { SVGProps } from "react";
import { cn } from "@/lib/cn";

export type SpinnerProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

export function Spinner({ size = 18, className, ...props }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(
        "shrink-0 animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]",
        className,
      )}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
