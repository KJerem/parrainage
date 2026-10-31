import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export const chipVariants = cva(
  "inline-flex max-w-full items-center gap-1.5 align-middle font-semibold",
  {
    variants: {
      variant: {
        success: "bg-brand-100 text-brand-700",
        warning: "bg-accent-100 text-accent-700",
        danger: "bg-danger-100 text-danger-600",
        info: "bg-info-100 text-info-600",
        neutral: "bg-canvas text-ink-soft",
        "solid-brand": "bg-brand-700 text-white",
        "danger-on-white": "bg-white text-danger-600",
        "solid-danger": "bg-danger-600 font-bold text-white",
      },
      size: {
        sm: "rounded-12 px-[9px] py-[3px] text-12",
        md: "rounded-20 px-2.5 py-1 text-13",
        kid: "rounded-10 px-2.5 py-1 text-16",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export type ChipProps = ComponentPropsWithRef<"span"> & VariantProps<typeof chipVariants>;

export function Chip({ variant, size, className, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ variant, size }), className)} {...props} />;
}

/** Même rendu que Chip : nom d'usage pour les statuts (binôme, versement, modération). */
export const StatusBadge = Chip;
export type StatusBadgeProps = ChipProps;

export type CountBadgeProps = Omit<ComponentPropsWithRef<"span">, "children"> & {
  count: number;
  /** Complément lu par les lecteurs d'écran, par ex. « messages non lus ». */
  srLabel?: string;
  max?: number;
};

export function CountBadge({ count, srLabel, max = 99, className, ...props }: CountBadgeProps) {
  const shown = count > max ? `${max}+` : String(count);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-10 bg-accent-500 px-[7px] py-px text-12 font-bold text-ink",
        className,
      )}
      {...props}
    >
      {srLabel ? (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="sr-only">
            {count} {srLabel}
          </span>
        </>
      ) : (
        shown
      )}
    </span>
  );
}
