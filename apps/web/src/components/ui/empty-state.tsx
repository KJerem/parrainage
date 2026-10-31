import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
  variant?: "default" | "kid";
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel: Heading = "h2",
  variant = "default",
  className,
  ...props
}: EmptyStateProps) {
  const kid = variant === "kid";
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-10 text-center",
        kid ? "gap-4" : "gap-3",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-brand-100 text-brand-700",
            kid ? "size-28" : "size-14",
          )}
        >
          {icon}
        </span>
      ) : null}
      <Heading className={cn("m-0", kid ? "text-22 font-extrabold" : "text-18 font-bold")}>
        {title}
      </Heading>
      {description ? (
        <p
          className={cn(
            "m-0 max-w-[420px] leading-[1.5] text-ink-soft",
            kid ? "text-18" : "text-14",
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2.5">{action}</div> : null}
    </div>
  );
}
