"use client";

import Link from "next/link";
import { useState, type ComponentProps, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

function pillClasses(active: boolean | undefined, className?: string) {
  return cn(
    "inline-flex min-h-9 cursor-pointer items-center rounded-18 border px-3 text-13 font-semibold no-underline transition-colors pointer-coarse:min-h-11",
    active
      ? "border-ink bg-ink text-white"
      : "border-line-strong bg-white text-ink hover:bg-canvas",
    className,
  );
}

export type FilterPillProps = Omit<ComponentPropsWithRef<"button">, "type"> & { active?: boolean };

export function FilterPill({ active = false, className, ...props }: FilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={pillClasses(active, className)}
      {...props}
    />
  );
}

/** Filtre porté par l'URL (`?filtre=…`) : un lien plutôt qu'un bouton. */
export type FilterPillLinkProps = ComponentProps<typeof Link> & { active?: boolean };

export function FilterPillLink({ active = false, className, ...props }: FilterPillLinkProps) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={pillClasses(active, className)}
      {...props}
    />
  );
}

export type FilterPillsProps<V extends string = string> = {
  options: readonly { value: V; label: ReactNode }[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
};

export function FilterPills<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  className,
  ...aria
}: FilterPillsProps<V>) {
  const [internal, setInternal] = useState<V | undefined>(defaultValue ?? options[0]?.value);
  const selected = value !== undefined ? value : internal;
  return (
    <div role="group" className={cn("flex flex-wrap gap-1.5", className)} {...aria}>
      {options.map((option) => (
        <FilterPill
          key={option.value}
          active={option.value === selected}
          onClick={() => {
            if (value === undefined) setInternal(option.value);
            if (option.value !== selected) onValueChange?.(option.value);
          }}
        >
          {option.label}
        </FilterPill>
      ))}
    </div>
  );
}
