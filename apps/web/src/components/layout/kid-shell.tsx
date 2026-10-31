import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, LockIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { MAIN_ID, SkipLink } from "./skip-link";

export type SessionPillProps = {
  children: ReactNode;
  icon?: boolean;
  className?: string;
};

/** Rappel de la session ouverte par le relais (fond brand-100). */
export function SessionPill({ children, icon = true, className }: SessionPillProps) {
  return (
    <p
      className={cn(
        "m-0 inline-flex items-center gap-2 rounded-10 bg-brand-100 px-3.5 py-2.5 text-14 font-semibold text-brand-700",
        className,
      )}
    >
      {icon ? <LockIcon size={18} /> : null}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export type KidShellProps = {
  /** Texte du haut : « Bonjour Aïcha ! », « Envoyer quelque chose à Claire »… */
  title: ReactNode;
  /** Avatar de l'enfant ou logo, avant le titre. */
  leading?: ReactNode;
  titleClassName?: string;
  /** « Session ouverte par M. Koffi · se ferme à 16 h 00 » */
  session?: ReactNode;
  sessionIcon?: boolean;
  backHref?: string;
  backLabel?: string;
  /** Lien « J'ai fini » (fin de session). */
  finishHref?: string;
  finishLabel?: string;
  mainClassName?: string;
  children: ReactNode;
};

/**
 * Coquille de l'espace enfant (Enfant, E-Connexion, E-Bulletin) : fond crème, conteneur 1160.
 * Sous lg la pastille de session passe à la ligne ; sous sm elle prend toute la largeur.
 */
export function KidShell({
  title,
  leading,
  titleClassName,
  session,
  sessionIcon = true,
  backHref,
  backLabel = "Retour",
  finishHref,
  finishLabel = "J'ai fini",
  mainClassName,
  children,
}: KidShellProps) {
  return (
    <div className="flex flex-1 flex-col bg-kid-canvas">
      <SkipLink />
      <header className="border-b border-kid-line bg-white">
        <div className="mx-auto flex max-w-kid flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 md:px-6">
          {backHref ? (
            <Button
              variant="kid-outline"
              href={backHref}
              leftIcon={<ArrowLeftIcon size={18} />}
              className="shrink-0 px-4"
            >
              {backLabel}
            </Button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {leading}
            <p className={cn("m-0 min-w-0 text-22 font-extrabold", titleClassName)}>{title}</p>
          </div>
          {session ? (
            <SessionPill icon={sessionIcon} className="max-lg:order-last max-sm:w-full">
              {session}
            </SessionPill>
          ) : null}
          {finishHref ? (
            <Button variant="kid-outline" href={finishHref} className="shrink-0">
              {finishLabel}
            </Button>
          ) : null}
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className={cn(
          "mx-auto flex w-full max-w-kid flex-1 flex-col gap-6 px-4 pt-7 pb-12 focus:outline-none md:px-6",
          mainClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
