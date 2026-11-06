"use client";

import Link from "next/link";
import { CountBadge } from "@/components/ui/chip";
import { HomeIcon, MessageIcon, UserIcon, UsersIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useActiveKey } from "./nav-links";

const items = [
  { key: "accueil", href: "/relais", label: "Accueil", exact: true, Icon: HomeIcon },
  { key: "enfants", href: "/relais/enfants", label: "Enfants", Icon: UsersIcon },
  { key: "messages", href: "/relais/messages", label: "Messages", Icon: MessageIcon },
  { key: "profil", href: "/relais/profil", label: "Profil", Icon: UserIcon },
] as const;

export type RelaisBottomNavKey = (typeof items)[number]["key"];

export type RelaisBottomNavProps = {
  active?: RelaisBottomNavKey;
  /** Compteurs par clé, par ex. `{ messages: 1 }` (messages non lus). */
  counts?: Partial<Record<string, number>>;
  className?: string;
};

/** Barre du bas de l'appli relais (sous md), collée au bas de l'écran. */
export function RelaisBottomNav({ active, counts = {}, className }: RelaisBottomNavProps) {
  const activeKey = useActiveKey(items, active);
  return (
    <nav
      aria-label="Navigation"
      className={cn(
        "sticky bottom-0 z-20 border-t border-line bg-white px-2 pt-1.5 pb-[max(18px,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <ul className="m-0 grid list-none grid-cols-4 p-0">
        {items.map(({ key, href, label, Icon }) => {
          const current = key === activeKey;
          const count = counts[key] ?? 0;
          return (
            <li key={key} className="min-w-0">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.75 rounded-10 py-2 text-12 no-underline",
                  current
                    ? "font-bold text-brand-700 hover:text-brand-700"
                    : "font-semibold text-muted hover:text-ink",
                )}
              >
                <span className="relative">
                  <Icon size={22} />
                  {count > 0 ? (
                    <CountBadge
                      count={count}
                      aria-hidden="true"
                      className="absolute -top-1.5 left-3.5 ring-2 ring-white"
                    />
                  ) : null}
                </span>
                {label}
                {count > 0 ? (
                  <span className="sr-only">
                    , {count} {count > 1 ? "non lus" : "non lu"}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
