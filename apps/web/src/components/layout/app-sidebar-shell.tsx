import type { ReactNode } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { AppTopBar } from "./app-top-bar";
import { MenuButton } from "./menu-button";
import {
  bureauIdentityMenu,
  bureauNav,
  relaisIdentityMenu,
  relaisNav,
  withCounts,
  type MenuItem,
  type NavItem,
} from "./nav-config";
import { SidebarNav } from "./nav-links";
import { MAIN_ID, SkipLink } from "./skip-link";

const tones = {
  relais: {
    title: "Espace relais",
    navLabel: "Menu relais",
    items: relaisNav,
    identityMenu: relaisIdentityMenu,
    panel: "bg-brand-700 px-3.5",
    identity:
      "text-brand-200 hover:bg-brand-600 aria-expanded:bg-brand-600 aria-expanded:text-white",
  },
  bureau: {
    title: "Bureau",
    navLabel: "Administration",
    items: bureauNav,
    identityMenu: bureauIdentityMenu,
    panel: "bg-ink px-4",
    identity: "text-side-ink hover:bg-ink-800 aria-expanded:bg-ink-800 aria-expanded:text-white",
  },
} as const;

export type SidebarTone = keyof typeof tones;

type SidebarPanelProps = {
  tone: SidebarTone;
  title: string;
  navLabel: string;
  items: readonly NavItem[];
  active?: string;
  identity: ReactNode;
  identityMenu: readonly MenuItem[];
};

/** Contenu de la barre latérale, rendu à la fois en colonne (≥ lg) et dans le tiroir. */
function SidebarPanel({
  tone,
  title,
  navLabel,
  items,
  active,
  identity,
  identityMenu,
}: SidebarPanelProps) {
  const styles = tones[tone];
  return (
    <div className={cn("flex min-h-full flex-col gap-1 py-6", styles.panel)}>
      <div className="flex items-center gap-2.5 px-2 pb-5 text-white">
        <Logo tone="accent" />
        <span className="text-16 font-bold">{title}</span>
      </div>
      <SidebarNav items={items} active={active} tone={tone} aria-label={navLabel} />
      <div className="mt-auto pt-4">
        <MenuButton
          items={identityMenu}
          placement="top-start"
          menuClassName="w-full"
          triggerClassName={cn(
            "flex min-h-11 w-full items-center justify-between gap-2 rounded-8 border-0 bg-transparent px-2 text-left text-13 transition-colors hover:text-white focus-visible:outline-accent-500",
            styles.identity,
          )}
        >
          <span className="min-w-0">{identity}</span>
          <ChevronRightIcon size={16} className="-rotate-90" />
        </MenuButton>
      </div>
    </div>
  );
}

export type AppSidebarShellProps = {
  tone: SidebarTone;
  /** Clé de l'entrée active ; sans elle, déduite de l'adresse. */
  active?: string;
  /** Pied de barre : « M. Koffi · Lomé, Bè ». Ouvre le menu Profil, Notifications, Se déconnecter. */
  identity: ReactNode;
  identityMenu?: readonly MenuItem[];
  items?: readonly NavItem[];
  /** Compteurs par clé, par ex. `{ moderation: 12 }`. */
  counts?: Partial<Record<string, number>>;
  title?: string;
  mainClassName?: string;
  children: ReactNode;
  /**
   * Chrome mobile sous md (relais) : en-tête et barre du bas remplacent la barre supérieure.
   * Le contenu de la page reste rendu une seule fois.
   */
  mobile?: { header?: ReactNode; bottomNav?: ReactNode };
};

/**
 * Coquille relais (vert) et bureau (sombre).
 * ≥ lg : barre latérale collante de 232 px. Sous lg : barre supérieure h56 et tiroir.
 */
export function AppSidebarShell({
  tone,
  active,
  identity,
  identityMenu,
  items,
  counts,
  title,
  mainClassName,
  children,
  mobile,
}: AppSidebarShellProps) {
  const styles = tones[tone];
  const resolvedTitle = title ?? styles.title;
  const panel = (
    <SidebarPanel
      tone={tone}
      title={resolvedTitle}
      navLabel={styles.navLabel}
      items={withCounts(items ?? styles.items, counts)}
      active={active}
      identity={identity}
      identityMenu={identityMenu ?? styles.identityMenu}
    />
  );

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <SkipLink />
      <AppTopBar
        tone={tone}
        title={resolvedTitle}
        drawerLabel={styles.navLabel}
        panel={panel}
        className={mobile ? "hidden md:flex lg:hidden" : "lg:hidden"}
        closeQuery={mobile ? "(max-width: 767.98px), (min-width: 1024px)" : "(min-width: 1024px)"}
      />
      {mobile?.header ? <div className="md:hidden">{mobile.header}</div> : null}
      <div className="sticky top-0 hidden h-dvh w-[232px] shrink-0 self-start overflow-y-auto lg:block">
        {panel}
      </div>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-6 p-4 focus:outline-none md:p-6 lg:p-8",
          mobile && "max-md:gap-5 max-md:p-5",
          mainClassName,
        )}
      >
        {children}
      </main>
      {mobile?.bottomNav}
    </div>
  );
}
