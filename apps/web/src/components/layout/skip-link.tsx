import { cn } from "@/lib/cn";

/** Cible du lien d'évitement : chaque coquille rend un seul `<main id="contenu">`. */
export const MAIN_ID = "contenu";

/**
 * Premier élément focalisable de chaque coquille, visible seulement au focus. L'ombre aussi :
 * hors écran, son flou débordait en haut de la page.
 */
export function SkipLink({ className }: { className?: string }) {
  return (
    <a
      href={`#${MAIN_ID}`}
      className={cn(
        "fixed top-3 left-3 z-50 -translate-y-[calc(100%+24px)] rounded-10 bg-white px-4 py-3 text-15 font-bold text-brand-700 no-underline focus:translate-y-0 focus:shadow-dialog",
        className,
      )}
    >
      Aller au contenu
    </a>
  );
}
