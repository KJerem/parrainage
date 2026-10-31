"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { CountBadge } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { findActiveKey, type NavItem } from "./nav-config";

/** `active` explicite, sinon déduit de l'adresse (coquille placée dans un layout). */
export function useActiveKey(items: readonly NavItem[], active?: string) {
  const pathname = usePathname();
  return active ?? findActiveKey(items, pathname);
}

export type ParrainNavProps = {
  items: readonly NavItem[];
  active?: string;
  className?: string;
};

/**
 * Pastilles du haut de l'espace parrain. Sous lg elles passent sur leur propre ligne et
 * défilent horizontalement ; l'entrée active est ramenée dans la zone visible.
 */
export function ParrainNav({ items, active, className }: ParrainNavProps) {
  const activeKey = useActiveKey(items, active);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    nav.scrollLeft = Math.max(0, current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2);
  }, [activeKey]);

  return (
    <nav
      ref={ref}
      aria-label="Navigation principale"
      className={cn("relative max-lg:snap-x max-lg:overflow-x-auto", className)}
    >
      <ul className="m-0 flex w-max list-none gap-1 p-0 max-lg:p-1">
        {items.map((item) => {
          const current = item.key === activeKey;
          return (
            <li key={item.key} className="shrink-0 snap-start">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-1 rounded-8 px-3.5 text-15 whitespace-nowrap no-underline transition-colors lg:min-h-0 lg:py-2.5 pointer-coarse:min-h-11",
                  current
                    ? "bg-brand-100 font-semibold text-brand-700 hover:text-brand-700"
                    : "font-medium text-ink-soft hover:bg-canvas hover:text-ink",
                )}
              >
                {item.label}
                {item.count ? (
                  <CountBadge count={item.count} srLabel={item.countLabel} className="ml-1" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const sidebarLinkTone = {
  relais: {
    base: "min-h-11 gap-2.5 px-3 hover:bg-brand-600",
    active: "bg-brand-600",
  },
  bureau: {
    base: "justify-between p-3 hover:bg-ink-800 pointer-coarse:min-h-11",
    active: "bg-ink-800",
  },
} as const;

export type SidebarNavProps = {
  items: readonly NavItem[];
  active?: string;
  tone: keyof typeof sidebarLinkTone;
  "aria-label": string;
  className?: string;
};

/** Liens verticaux des barres latérales relais (vert) et bureau (sombre). */
export function SidebarNav({ items, active, tone, className, ...aria }: SidebarNavProps) {
  const activeKey = useActiveKey(items, active);
  const styles = sidebarLinkTone[tone];
  return (
    <nav className={className} {...aria}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((item) => {
          const current = item.key === activeKey;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center rounded-8 text-15 no-underline transition-colors hover:text-white focus-visible:outline-accent-500",
                  styles.base,
                  current
                    ? cn(styles.active, "font-semibold text-white")
                    : "font-medium text-side-ink",
                )}
              >
                <span className="min-w-0">{item.label}</span>
                {item.count ? (
                  <CountBadge
                    count={item.count}
                    srLabel={item.countLabel}
                    className="ml-auto px-2"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
