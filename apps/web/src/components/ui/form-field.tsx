import { cva, type VariantProps } from "class-variance-authority";
import {
  cloneElement,
  isValidElement,
  useId,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const labelVariants = cva("font-semibold", {
  variants: {
    size: {
      sm: "text-13",
      md: "text-14",
      kid: "text-18 font-bold",
    },
  },
  defaultVariants: { size: "md" },
});

type FieldSize = NonNullable<VariantProps<typeof labelVariants>["size"]>;

export type LabelProps = ComponentPropsWithRef<"label"> &
  VariantProps<typeof labelVariants> & { srOnly?: boolean };

export function Label({ size, srOnly, className, ...props }: LabelProps) {
  return (
    <label className={cn(labelVariants({ size }), srOnly && "sr-only", className)} {...props} />
  );
}

/** Propriétés injectées par FormField dans son champ. */
export type FieldControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  required?: boolean;
};

export type FormFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
  /** Libellé lu par les lecteurs d'écran mais masqué à l'écran. */
  hideLabel?: boolean;
  required?: boolean;
  size?: FieldSize;
  className?: string;
  children: ReactElement<FieldControlProps> | ((field: FieldControlProps) => ReactNode);
};

export function FormField({
  label,
  hint,
  error,
  id,
  hideLabel,
  required,
  size = "md",
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-aide`;
  const errorId = `${controlId}-erreur`;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";

  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ");
  const field: FieldControlProps = {
    id: controlId,
    ...(hasError ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(required ? { required: true } : {}),
  };

  let control: ReactNode;
  if (typeof children === "function") {
    control = children(field);
  } else if (isValidElement(children)) {
    const own = children.props["aria-describedby"];
    control = cloneElement(children, {
      ...field,
      "aria-describedby": [own, field["aria-describedby"]].filter(Boolean).join(" ") || undefined,
    });
  }

  return (
    <div className={cn("flex min-w-0 flex-col", size === "sm" ? "gap-1" : "gap-1.5", className)}>
      <Label htmlFor={controlId} size={size} srOnly={hideLabel}>
        {label}
      </Label>
      {control}
      {hint ? (
        <p id={hintId} className={cn("m-0 text-muted", size === "kid" ? "text-16" : "text-13")}>
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <p
          id={errorId}
          className={cn(
            "m-0 font-semibold text-danger-600",
            size === "kid" ? "text-16" : "text-13",
          )}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

const fieldBase =
  "w-full min-w-0 border border-line-strong bg-white text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-canvas aria-invalid:border-danger-600";

export const inputVariants = cva(fieldBase, {
  variants: {
    size: {
      sm: "min-h-10 rounded-10 px-3 text-14 max-md:text-16",
      md: "min-h-11 rounded-10 px-3 text-15 max-md:text-16",
      lg: "min-h-12 rounded-10 px-3.5 text-16",
      kid: "min-h-14 rounded-14 border-2 px-4 text-18 max-md:text-18",
    },
  },
  defaultVariants: { size: "md" },
});

export type InputProps = Omit<ComponentPropsWithRef<"input">, "size"> &
  VariantProps<typeof inputVariants>;

export function Input({ size, className, ...props }: InputProps) {
  return <input className={cn(inputVariants({ size }), className)} {...props} />;
}

export const textareaVariants = cva(cn(fieldBase, "block resize-y leading-[1.5]"), {
  variants: {
    size: {
      md: "rounded-12 p-3 text-15 max-md:text-16",
      kid: "rounded-14 border-2 px-4 py-3.5 text-18 max-md:text-18",
    },
  },
  defaultVariants: { size: "md" },
});

export type TextareaProps = ComponentPropsWithRef<"textarea"> &
  VariantProps<typeof textareaVariants>;

export function Textarea({ size, className, ...props }: TextareaProps) {
  return <textarea className={cn(textareaVariants({ size }), className)} {...props} />;
}

export const selectVariants = cva(cn(fieldBase, "cursor-pointer"), {
  variants: {
    size: {
      sm: "min-h-10 rounded-10 px-2.5 text-14 max-md:text-16",
      md: "min-h-11 rounded-10 px-3 text-15 max-md:text-16",
    },
  },
  defaultVariants: { size: "md" },
});

export type SelectProps = Omit<ComponentPropsWithRef<"select">, "size"> &
  VariantProps<typeof selectVariants>;

export function Select({ size, className, ...props }: SelectProps) {
  return <select className={cn(selectVariants({ size }), className)} {...props} />;
}

const choiceInput =
  "m-0 size-5 shrink-0 cursor-pointer accent-brand-700 disabled:cursor-not-allowed";

export type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type" | "size"> & {
  label: ReactNode;
  hideLabel?: boolean;
  labelClassName?: string;
};

export function Checkbox({ label, hideLabel, className, labelClassName, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 text-14 leading-[1.45] pointer-coarse:min-h-11",
        labelClassName,
      )}
    >
      <input type="checkbox" className={cn(choiceInput, "mt-px", className)} {...props} />
      <span className={cn(hideLabel && "sr-only")}>{label}</span>
    </label>
  );
}

export type ChoiceCardProps = Omit<ComponentPropsWithRef<"input">, "type" | "size"> & {
  children: ReactNode;
  labelClassName?: string;
};

const choiceCard =
  "flex min-w-0 cursor-pointer items-center gap-3 rounded-12 border border-line bg-white p-3 text-14 has-checked:border-brand-700 has-checked:bg-brand-100 has-disabled:cursor-not-allowed has-disabled:opacity-60";

/** Carte cliquable contenant un bouton radio natif (choix d'un parrain…). */
export function RadioCard({ children, className, labelClassName, ...props }: ChoiceCardProps) {
  return (
    <label className={cn(choiceCard, labelClassName)}>
      <input type="radio" className={cn(choiceInput, className)} {...props} />
      {children}
    </label>
  );
}

/** Variante case à cocher (enfants autorisés d'une session…). */
export function CheckboxCard({ children, className, labelClassName, ...props }: ChoiceCardProps) {
  return (
    <label className={cn(choiceCard, "gap-2.5 px-3 py-2.5 font-semibold", labelClassName)}>
      <input type="checkbox" className={cn(choiceInput, className)} {...props} />
      {children}
    </label>
  );
}
