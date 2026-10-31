import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { MenuButton } from "./menu-button";
import {
  parrainAccountMenu,
  parrainNav,
  withCounts,
  type MenuItem,
  type ParrainNavKey,
} from "./nav-config";
import { ParrainNav } from "./nav-links";
import { MAIN_ID, SkipLink } from "./skip-link";

export type ParrainShellProps = {
  /** Entrée active ; sans elle, déduite de l'adresse. */
  active?: ParrainNavKey;
  user: { initials: string; name: string };
  unreadMessages?: number;
  accountMenu?: readonly MenuItem[];
  mainClassName?: string;
  children: ReactNode;
};

/**
 * Coquille parrain (Main.dc.html, P-Messages.dc.html).
 * ≥ lg : logo, navigation et avatar sur une ligne. Sous lg : logo et avatar, puis les
 * pastilles de navigation sur une seconde ligne qui défile horizontalement.
 */
export function ParrainShell({
  active,
  user,
  unreadMessages = 0,
  accountMenu = parrainAccountMenu,
  mainClassName,
  children,
}: ParrainShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <SkipLink />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-parrain flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 md:px-6">
          <Link
            href="/parrain"
            className="flex items-center gap-2.5 text-ink no-underline hover:text-ink"
          >
            <Logo />
            <span className="text-17 font-bold">Parrainage</span>
          </Link>
          <ParrainNav
            items={withCounts(parrainNav, { messages: unreadMessages })}
            active={active}
            className="max-lg:order-last max-lg:-mx-1 max-lg:grow max-lg:basis-full lg:flex-1"
          />
          <MenuButton
            items={accountMenu}
            // Le nom accessible reprend les initiales visibles (WCAG 2.5.3).
            label={`${user.initials}, mon compte`}
            header={<strong className="text-14 text-ink">{user.name}</strong>}
            className="ml-auto lg:ml-0"
            triggerClassName="flex size-10 items-center justify-center rounded-full border-0 bg-info-150 text-14 font-bold text-info-600 pointer-coarse:size-11"
          >
            {user.initials}
          </MenuButton>
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={cn(
          "mx-auto flex w-full max-w-parrain flex-1 flex-col gap-6 px-4 pt-8 pb-14 focus:outline-none md:px-6",
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
