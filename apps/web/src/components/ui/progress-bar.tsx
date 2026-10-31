import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

const trackSize = { md: "h-2 rounded-4", lg: "h-2.5 rounded-5" } as const;
const fillTone = { brand: "bg-brand-700", soft: "bg-brand-300", accent: "bg-accent-500" } as const;

export type ProgressBarProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  value: number;
  max?: number;
  /** Libellé affiché à gauche ; sans lui, passer `aria-label`. */
  label?: ReactNode;
  /** Valeur affichée à droite (« 13,4 / 20 ») ; lue aussi comme `aria-valuetext`. */
  valueLabel?: string;
  size?: keyof typeof trackSize;
  tone?: keyof typeof fillTone;
  trackClassName?: string;
};

export function ProgressBar({
  value,
  max = 100,
  label,
  valueLabel,
  size = "md",
  tone = "brand",
  className,
  trackClassName,
  "aria-label": ariaLabel,
  ...props
}: ProgressBarProps) {
  const labelId = useId();
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;

  const bar = (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueLabel}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      className={cn("w-full overflow-hidden bg-brand-100", trackSize[size], trackClassName)}
    >
      <div
        className={cn("h-full", trackSize[size], fillTone[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );

  if (!label) {
    return (
      <div className={cn("min-w-0", className)} {...props}>
        {bar}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)} {...props}>
      <div className="flex justify-between gap-3 text-14">
        <span id={labelId}>{label}</span>
        {valueLabel ? <strong aria-hidden="true">{valueLabel}</strong> : null}
      </div>
      {bar}
    </div>
  );
}
