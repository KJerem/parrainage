/* eslint-disable @next/next/no-img-element -- photos servies par /api/media (302 vers une URL
   présignée de 120 s) : l'optimiseur de next/image n'a pas la session du visiteur. */
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const avatarVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full leading-none select-none",
  {
    variants: {
      size: {
        28: "size-7 text-12 font-bold",
        36: "size-9 text-13 font-bold",
        40: "size-10 text-14 font-bold",
        44: "size-11 text-16 font-bold",
        48: "size-12 text-18 font-extrabold",
        56: "size-14 text-16 font-extrabold",
        88: "size-22 text-24 font-extrabold",
        96: "size-24 text-30 font-extrabold",
      },
      tone: {
        amber: "bg-accent-500 text-ink",
        brand: "bg-brand-100 text-brand-700",
        neutral: "bg-canvas text-ink-soft",
        dark: "bg-ink text-white",
        info: "bg-info-100 text-info-600",
        "info-strong": "bg-info-150 text-info-600",
        "amber-soft": "bg-accent-100 text-accent-700",
        danger: "bg-danger-100 text-danger-600",
        white: "bg-white text-brand-700",
      },
    },
    defaultVariants: { size: 40, tone: "brand" },
  },
);

type AvatarSize = NonNullable<VariantProps<typeof avatarVariants>["size"]>;

export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> &
  VariantProps<typeof avatarVariants> & {
    initials?: string;
    /** Photo : `alt` devient le nom accessible. */
    src?: string;
    alt?: string;
    /** Nom accessible quand l'avatar n'est pas doublé d'un texte visible. */
    label?: string;
    children?: ReactNode;
  };

export function Avatar({
  size = 40,
  tone,
  initials,
  src,
  alt,
  label,
  className,
  children,
  ...props
}: AvatarProps) {
  const pixels = (size ?? 40) as AvatarSize;
  const a11y = src
    ? {}
    : label
      ? { role: "img" as const, "aria-label": label }
      : { "aria-hidden": true as const };
  return (
    <span className={cn(avatarVariants({ size: pixels, tone }), className)} {...a11y} {...props}>
      {src ? (
        <img
          src={src}
          alt={alt ?? label ?? ""}
          width={pixels}
          height={pixels}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        (children ?? initials)
      )}
    </span>
  );
}

const photoTone = {
  accent: "bg-accent-100 text-accent-700",
  brand: "bg-brand-100 text-brand-700",
  neutral: "bg-canvas text-ink-soft",
} as const;

export type PhotoSquareProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Texte du gabarit en l'absence de photo (« Photo d'Aïcha »). */
  label?: ReactNode;
  src?: string;
  alt?: string;
  size?: number;
  tone?: keyof typeof photoTone;
};

export function PhotoSquare({
  label,
  src,
  alt = "",
  size = 120,
  tone = "accent",
  className,
  style,
  ...props
}: PhotoSquareProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-16 px-2 text-center text-13 font-semibold",
        photoTone[tone],
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        label
      )}
    </div>
  );
}
