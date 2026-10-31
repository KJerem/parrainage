"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<V extends string = string> = {
  value: V;
  label: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<V extends string = string> = {
  options: readonly SegmentedOption<V>[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  /** Nom du champ caché envoyé avec le formulaire. */
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
};

export function SegmentedControl<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  className,
  ...aria
}: SegmentedControlProps<V>) {
  const [internal, setInternal] = useState<V | undefined>(defaultValue);
  const selected = value !== undefined ? value : internal;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedIndex = options.findIndex((o) => o.value === selected && !o.disabled);
  const tabStop = selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled);

  function select(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (value === undefined) setInternal(option.value);
    if (option.value !== selected) onValueChange?.(option.value);
  }

  function step(from: number, delta: 1 | -1) {
    for (let i = 1; i <= options.length; i++) {
      const index = (from + delta * i + options.length) % options.length;
      if (!options[index]?.disabled) return index;
    }
    return from;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = step(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = step(index, -1);
        break;
      case "Home":
        next = step(-1, 1);
        break;
      case "End":
        next = step(options.length, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    buttons.current[next]?.focus();
    select(next);
  }

  return (
    <div role="radiogroup" className={cn("flex flex-wrap gap-2", className)} {...aria}>
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={option.disabled}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "min-h-11 cursor-pointer rounded-10 border px-4 text-14 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              checked
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line-strong bg-white text-ink hover:bg-canvas",
            )}
          >
            {option.label}
          </button>
        );
      })}
      {name ? <input type="hidden" name={name} value={selected ?? ""} /> : null}
    </div>
  );
}
