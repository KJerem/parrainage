"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MenuItem } from "./nav-config";

const placements = {
  "bottom-end": "top-full right-0 mt-2",
  "top-start": "bottom-full left-0 mb-2",
} as const;

const itemClass =
  "flex min-h-10 w-full cursor-pointer items-center rounded-8 border-0 bg-transparent px-3 text-left text-14 font-semibold text-ink no-underline hover:bg-canvas hover:text-ink focus-visible:bg-canvas pointer-coarse:min-h-11";

export type MenuButtonProps = {
  items: readonly MenuItem[];
  /** Contenu du déclencheur (initiales, identité…). */
  children: ReactNode;
  /** Nom accessible du déclencheur quand son contenu ne suffit pas. */
  label?: string;
  /** Texte d'en-tête du menu (nom de la personne), hors des éléments de menu. */
  header?: ReactNode;
  placement?: keyof typeof placements;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
};

/** Bouton de menu (motif WAI-ARIA « menu button ») : flèches, Début/Fin, Échap, Tab. */
export function MenuButton({
  items,
  children,
  label,
  header,
  placement = "bottom-end",
  className,
  triggerClassName,
  menuClassName,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const triggerId = useId();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    if (index !== null) itemRefs.current[index]?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openAt(index: number) {
    pendingFocus.current = index;
    setOpen(true);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(items.length - 1);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = current >= last ? 0 : current + 1;
        break;
      case "ArrowUp":
        next = current <= 0 ? last : current - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      case "Tab":
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    itemRefs.current[next]?.focus();
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        className={cn("cursor-pointer", triggerClassName)}
      >
        {children}
      </button>
      <div
        hidden={!open}
        className={cn(
          "absolute z-40 w-56 rounded-12 border border-line bg-white p-1.5 text-ink shadow-dialog",
          placements[placement],
          menuClassName,
        )}
      >
        {header ? <div className="px-3 pt-1.5 pb-2 text-13 text-muted">{header}</div> : null}
        <ul
          role="menu"
          id={menuId}
          aria-labelledby={triggerId}
          onKeyDown={onMenuKeyDown}
          className="m-0 flex list-none flex-col gap-0.5 p-0"
        >
          {items.map((item, index) => {
            const ref = (node: HTMLElement | null) => {
              itemRefs.current[index] = node;
            };
            return (
              <li key={item.label} role="none">
                {"href" in item ? (
                  <Link
                    ref={ref}
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => setOpen(false)}
                    className={itemClass}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <form method="post" action={item.action}>
                    <button
                      ref={ref}
                      type="submit"
                      role="menuitem"
                      tabIndex={-1}
                      className={itemClass}
                    >
                      {item.label}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
