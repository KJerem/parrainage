import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type FormAlertProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Erreur d'un formulaire, annoncée aussitôt (role="alert"). À rendre seulement quand une erreur
 * existe : l'insertion déclenche l'annonce, y compris pour un message identique au précédent.
 */
export function FormAlert({ children, className }: FormAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-12 bg-danger-100 px-3.5 py-3 text-14 leading-[1.45] font-semibold text-danger-600",
        className,
      )}
    >
      {children}
    </div>
  );
}
