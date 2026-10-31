import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

// L'ordre compte : `size` avant `variant`, pour que la graisse d'une variante l'emporte.
export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 border border-transparent text-center font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      size: {
        sm: "min-h-9 rounded-8 px-3 text-13 pointer-coarse:min-h-11",
        md: "min-h-10 rounded-8 px-3.5 text-13 pointer-coarse:min-h-11",
        lg: "min-h-11 rounded-10 px-4 text-14",
        xl: "min-h-12 rounded-10 px-4.5 text-15",
        "2xl": "min-h-13 rounded-12 px-6 text-16 font-bold",
        "kid-sm": "min-h-12 rounded-12 px-5 text-16",
        kid: "min-h-14 gap-2.5 rounded-14 px-8 text-18",
        "kid-lg": "min-h-15 gap-2.5 rounded-14 px-7 text-18",
        "kid-xl": "min-h-16 gap-2.5 rounded-16 px-10 text-20",
      },
      variant: {
        primary: "bg-brand-700 text-white hover:bg-brand-900",
        accent: "bg-accent-500 font-bold text-ink hover:bg-accent-600",
        secondary: "border-line-strong bg-white text-ink hover:bg-canvas",
        ghost: "bg-transparent text-brand-700 hover:bg-brand-100",
        "soft-accent": "bg-accent-100 text-accent-700 hover:brightness-95",
        "soft-brand": "bg-brand-100 text-brand-700 hover:bg-brand-200",
        "outline-on-dark":
          "border-brand-400 bg-transparent text-white hover:bg-brand-600 focus-visible:outline-accent-500",
        "kid-outline": "border-2 border-ink bg-white font-bold text-ink hover:bg-kid-canvas",
        "kid-primary": "bg-brand-700 font-extrabold text-white hover:bg-brand-900",
        "kid-accent": "bg-accent-500 font-extrabold text-ink hover:bg-accent-600",
      },
      fullWidth: { true: "w-full" },
      iconOnly: { true: "shrink-0 px-0" },
    },
    compoundVariants: [
      { variant: "primary", size: "xl", class: "font-bold" },
      { iconOnly: true, size: "sm", class: "size-9 pointer-coarse:size-11" },
      { iconOnly: true, size: "md", class: "size-10 pointer-coarse:size-11" },
      { iconOnly: true, size: "lg", class: "size-11 rounded-12" },
      { iconOnly: true, size: "xl", class: "size-12" },
    ],
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Bouton carré ne contenant qu'une icône : `aria-label` obligatoire. */
  iconOnly?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithRef<"button">, keyof ButtonOwnProps> & { href?: undefined };

export type ButtonAsLinkProps = ButtonOwnProps &
  Omit<ComponentProps<typeof Link>, keyof ButtonOwnProps>;

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function defaultSize(variant: ButtonVariant): ButtonSize {
  if (variant === "kid-outline") return "kid-sm";
  if (variant === "kid-primary" || variant === "kid-accent") return "kid";
  return "lg";
}

const spinnerSize: Record<ButtonSize, number> = {
  sm: 16,
  md: 16,
  lg: 18,
  xl: 18,
  "2xl": 18,
  "kid-sm": 18,
  kid: 20,
  "kid-lg": 20,
  "kid-xl": 22,
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size: sizeProp,
    fullWidth,
    iconOnly,
    loading = false,
    leftIcon,
    rightIcon,
    className,
    children,
    ...rest
  } = props;
  const size = sizeProp ?? defaultSize(variant);
  const classes = cn(buttonVariants({ variant, size, fullWidth, iconOnly }), className);
  const content = (
    <>
      {loading ? <Spinner size={spinnerSize[size]} /> : leftIcon}
      {children}
      {rightIcon}
    </>
  );

  if (rest.href !== undefined) {
    const linkProps = rest as Omit<ButtonAsLinkProps, keyof ButtonOwnProps>;
    return (
      <Link {...linkProps} className={classes} aria-busy={loading || undefined}>
        {content}
      </Link>
    );
  }

  const {
    type = "button",
    disabled,
    ...buttonProps
  } = rest as Omit<ButtonAsButtonProps, keyof ButtonOwnProps>;
  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}
