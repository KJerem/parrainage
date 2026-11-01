import Link from "next/link";
import { cn } from "@/lib/cn";
import { Avatar, type AvatarProps } from "./avatar";

export type ChildSwitcherItem = {
  id: string;
  /** Prénom affiché. */
  label: string;
  initials: string;
  tone?: AvatarProps["tone"];
  href: string;
};

export type ChildSwitcherProps = {
  items: readonly ChildSwitcherItem[];
  currentId: string;
  "aria-label"?: string;
  className?: string;
};

/**
 * Sélecteur de filleul (Main.dc.html) : des liens qui changent `?filleul=`, le filleul affiché
 * porte `aria-current`. Sous sm, la rangée défile horizontalement.
 */
export function ChildSwitcher({
  items,
  currentId,
  "aria-label": label = "Choisir un filleul",
  className,
}: ChildSwitcherProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "max-w-full min-w-0 rounded-12 border border-line bg-white p-1 max-sm:overflow-x-auto",
        className,
      )}
    >
      <ul className="m-0 flex w-max list-none gap-2 p-0">
        {items.map((item) => {
          const current = item.id === currentId;
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-9 py-2 pr-3.5 pl-2 text-15 font-semibold whitespace-nowrap no-underline transition-colors",
                  current
                    ? "bg-brand-700 text-white hover:text-white"
                    : "text-ink hover:bg-canvas hover:text-ink",
                )}
              >
                <Avatar size={28} tone={item.tone} initials={item.initials} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
