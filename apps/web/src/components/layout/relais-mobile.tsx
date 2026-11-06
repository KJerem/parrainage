import Link from "next/link";
import type { ReactNode } from "react";
import { BellIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { AppSidebarShell, type AppSidebarShellProps } from "./app-sidebar-shell";
import type { RelaisNavKey } from "./nav-config";
import { RelaisBottomNav, type RelaisBottomNavKey } from "./relais-bottom-nav";
import { MAIN_ID, SkipLink } from "./skip-link";

export type RelaisMobileHeaderProps = {
  /** « Relais · Lomé, quartier Bè » */
  subtitle: ReactNode;
  /** « Bonjour M. Koffi » : titre de la page sur mobile. */
  title: ReactNode;
  titleAs?: "h1" | "p";
  notificationsHref?: string;
  unreadNotifications?: number;
  /** Bandeau sous le titre, par ex. `<Notice variant="offline-dark" size="sm">`. */
  banner?: ReactNode;
  className?: string;
};

/** En-tête vert de l'accueil relais mobile (Relais.dc.html). */
export function RelaisMobileHeader({
  subtitle,
  title,
  titleAs: Title = "h1",
  notificationsHref = "/relais/notifications",
  unreadNotifications = 0,
  banner,
  className,
}: RelaisMobileHeaderProps) {
  const unread = unreadNotifications > 0;
  return (
    <header
      className={cn(
        "flex flex-col gap-3.5 bg-brand-700 px-5 pt-[max(24px,env(safe-area-inset-top))] pb-5 text-white",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-13 text-brand-200">{subtitle}</p>
          <Title className="m-0 text-22 font-extrabold">{title}</Title>
        </div>
        <Link
          href={notificationsHref}
          aria-label={unread ? `Notifications, ${unreadNotifications} non lues` : "Notifications"}
          className="relative flex size-11 shrink-0 items-center justify-center rounded-12 bg-brand-600 text-white transition-colors hover:bg-brand-900 hover:text-white focus-visible:outline-accent-500"
        >
          <BellIcon size={20} />
          {unread ? (
            <span className="absolute top-2 right-2 size-2.5 rounded-full bg-accent-500 ring-2 ring-brand-600" />
          ) : null}
        </Link>
      </div>
      {banner}
    </header>
  );
}

export type MobileSubHeaderProps = {
  title: ReactNode;
  backHref: string;
  backLabel?: string;
  /** Action à droite du titre (facultative). */
  action?: ReactNode;
  className?: string;
};

/** En-tête blanc des écrans relais mobiles secondaires (RM-Publier.dc.html). */
export function MobileSubHeader({
  title,
  backHref,
  backLabel = "Retour",
  action,
  className,
}: MobileSubHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center gap-2 border-b border-line-soft bg-white px-4 pt-[max(20px,env(safe-area-inset-top))] pb-3",
        className,
      )}
    >
      <Link
        href={backHref}
        aria-label={backLabel}
        className="flex size-11 shrink-0 items-center justify-center rounded-12 text-ink transition-colors hover:bg-canvas hover:text-ink"
      >
        <ChevronLeftIcon size={22} />
      </Link>
      <h1 className="m-0 min-w-0 flex-1 text-19 font-extrabold">{title}</h1>
      {action}
    </header>
  );
}

export type RelaisMobileShellProps = {
  /** `RelaisMobileHeader` sur l'accueil, `MobileSubHeader` ailleurs. */
  header: ReactNode;
  active?: RelaisBottomNavKey;
  mainClassName?: string;
  children: ReactNode;
};

/** Coquille de l'appli relais seule (sans variante web) : en-tête, contenu, barre du bas. */
export function RelaisMobileShell({
  header,
  active,
  mainClassName,
  children,
}: RelaisMobileShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <SkipLink />
      {header}
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={cn("flex flex-1 flex-col gap-5 p-5 focus:outline-none", mainClassName)}
      >
        {children}
      </main>
      <RelaisBottomNav active={active} />
    </div>
  );
}

const bottomNavKeys: readonly string[] = ["accueil", "enfants", "messages", "profil"];

export type RelaisResponsiveShellProps = Omit<
  AppSidebarShellProps,
  "tone" | "mobile" | "active"
> & {
  active?: RelaisNavKey;
  /** En-tête affiché sous md à la place de la barre supérieure. */
  mobileHeader: ReactNode;
  /** Entrée active de la barre du bas ; par défaut celle de même clé que `active`. */
  mobileActive?: RelaisBottomNavKey;
};

/**
 * Relais sur toutes les largeurs, mêmes routes :
 * ≥ lg barre latérale, md–lg barre supérieure + tiroir, < md en-tête mobile + barre du bas.
 * Seul le chrome bascule (classes CSS) ; `children` n'est monté qu'une fois.
 */
export function RelaisResponsiveShell({
  active,
  mobileActive,
  mobileHeader,
  counts,
  ...props
}: RelaisResponsiveShellProps) {
  const bottomActive =
    mobileActive ??
    (active && bottomNavKeys.includes(active) ? (active as RelaisBottomNavKey) : undefined);
  return (
    <AppSidebarShell
      tone="relais"
      active={active}
      counts={counts}
      {...props}
      mobile={{
        header: mobileHeader,
        bottomNav: <RelaisBottomNav active={bottomActive} counts={counts} className="md:hidden" />,
      }}
    />
  );
}
