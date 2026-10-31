import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const logoVariants = cva(
  "inline-flex shrink-0 items-center justify-center leading-none font-extrabold select-none",
  {
    variants: {
      size: {
        36: "size-9 rounded-10 text-14",
        40: "size-10 rounded-12 text-14",
        44: "size-11 rounded-12 text-16",
      },
      tone: {
        brand: "bg-brand-700 text-white",
        accent: "bg-accent-500 text-ink",
      },
    },
    defaultVariants: { size: 36, tone: "brand" },
  },
);

export type LogoProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> &
  VariantProps<typeof logoVariants>;

export function Logo({ size, tone, className, ...props }: LogoProps) {
  return (
    <span className={cn(logoVariants({ size, tone }), className)} {...props}>
      LRT
    </span>
  );
}
