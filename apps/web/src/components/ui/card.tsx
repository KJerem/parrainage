import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

export const cardVariants = cva("group/card min-w-0", {
  variants: {
    variant: {
      default: "rounded-16 border border-line bg-white",
      brand: "rounded-16 bg-brand-700 text-white",
      "notice-accent": "rounded-16 bg-accent-100 text-14 leading-[1.5] text-accent-900",
      "notice-brand": "rounded-16 bg-brand-100 text-14 leading-[1.5]",
      kid: "rounded-20 border border-kid-line bg-white",
      inset: "rounded-12 bg-canvas",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4.5",
      lg: "p-5",
      xl: "p-6",
    },
  },
  defaultVariants: { variant: "default" },
});

type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>;

export type CardProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof cardVariants> & {
    as?: "div" | "section" | "article" | "aside" | "li" | "form" | "fieldset";
    ref?: Ref<HTMLElement>;
  };

export function Card({
  as: Component = "div",
  variant = "default",
  padding,
  className,
  ...props
}: CardProps) {
  const resolvedPadding = padding ?? (variant === "inset" ? "sm" : "lg");
  return (
    <Component
      data-variant={variant as CardVariant}
      className={cn(cardVariants({ variant, padding: resolvedPadding }), className)}
      {...(props as HTMLAttributes<HTMLElement>)}
    />
  );
}

export type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4" | "strong";
};

export function CardTitle({ as: Component = "h2", className, ...props }: CardTitleProps) {
  return <Component className={cn("m-0 text-18 font-bold", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "m-0 text-14 text-ink-soft group-data-[variant=brand]/card:text-brand-200",
        className,
      )}
      {...props}
    />
  );
}

const statTileVariants = cva("flex min-w-0 flex-col rounded-14", {
  variants: {
    variant: {
      default: "border border-line bg-white",
      accent: "bg-accent-100",
    },
    size: {
      sm: "p-4",
      md: "p-4.5",
      lg: "gap-1.5 p-4.5",
    },
  },
  defaultVariants: { variant: "default", size: "md" },
});

const statValueSize = { sm: "text-26", md: "text-28", lg: "text-30" } as const;
const statLabelSize = { sm: "text-13", md: "text-14", lg: "text-14" } as const;
const statTone = {
  default: "",
  warning: "text-accent-700",
  danger: "text-danger-600",
} as const;

export type StatTileProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> &
  VariantProps<typeof statTileVariants> & {
    label: ReactNode;
    value: ReactNode;
    sub?: ReactNode;
    tone?: keyof typeof statTone;
  };

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  variant = "default",
  size = "md",
  className,
  ...props
}: StatTileProps) {
  const s = size ?? "md";
  const accent = variant === "accent";
  return (
    <div className={cn(statTileVariants({ variant, size: s }), className)} {...props}>
      <div
        className={cn("font-semibold", statLabelSize[s], accent ? "text-accent-700" : "text-muted")}
      >
        {label}
      </div>
      <div className={cn("font-extrabold", statValueSize[s], statTone[tone])}>{value}</div>
      {sub ? (
        <div className={cn("text-13", accent ? "text-accent-900" : "text-ink-soft")}>{sub}</div>
      ) : null}
    </div>
  );
}
