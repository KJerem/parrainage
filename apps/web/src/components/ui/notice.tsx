import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { WifiIcon } from "./icons";

export const noticeVariants = cva("flex gap-2", {
  variants: {
    variant: {
      accent: "bg-accent-100 text-accent-900",
      brand: "bg-brand-100 text-ink",
      "offline-dark": "bg-brand-600 text-white",
    },
    size: {
      sm: "rounded-12 px-3 py-2.5 text-13",
      md: "rounded-12 p-3 text-14 leading-[1.5]",
    },
  },
  compoundVariants: [{ variant: "offline-dark", class: "rounded-10" }],
  defaultVariants: { variant: "accent", size: "md" },
});

export type NoticeProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> &
  VariantProps<typeof noticeVariants> & {
    title?: ReactNode;
    /** Icône de tête ; `null` la retire (la variante hors ligne affiche le wifi ambre). */
    icon?: ReactNode;
  };

export function Notice({
  variant = "accent",
  size,
  title,
  icon,
  className,
  children,
  ...props
}: NoticeProps) {
  const leading =
    icon !== undefined ? (
      icon
    ) : variant === "offline-dark" ? (
      <WifiIcon size={16} className="text-accent-500" />
    ) : null;
  return (
    <div
      className={cn(
        noticeVariants({ variant, size }),
        title ? "items-start" : "items-center",
        className,
      )}
      {...props}
    >
      {leading}
      <div className="min-w-0 flex-1">
        {title ? (
          <strong
            className={cn("mb-1 block", variant === "offline-dark" ? "text-white" : "text-ink")}
          >
            {title}
          </strong>
        ) : null}
        {children}
      </div>
    </div>
  );
}
