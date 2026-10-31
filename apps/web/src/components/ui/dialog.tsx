"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { CloseIcon } from "./icons";
import { useModalDialog } from "./use-modal-dialog";

const widths = {
  sm: "max-w-form",
  md: "max-w-[480px]",
  lg: "max-w-success",
} as const;

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Boutons d'action, alignés à droite (pleine largeur en feuille mobile). */
  footer?: ReactNode;
  size?: keyof typeof widths;
  closeLabel?: string;
  hideClose?: boolean;
  className?: string;
};

/**
 * `<dialog>` natif en mode modal : le reste de la page devient inerte.
 * Sous md, il s'affiche en feuille collée au bas de l'écran.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Fermer",
  hideClose = false,
  className,
}: DialogProps) {
  const { ref, dialogProps } = useModalDialog(open, onOpenChange);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...dialogProps}
      className={cn(
        "m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-y-auto rounded-16 bg-white p-0 text-ink shadow-dialog backdrop:bg-ink/50",
        "max-md:mx-0 max-md:mt-auto max-md:mb-0 max-md:max-h-[calc(100dvh-24px)] max-md:w-full max-md:max-w-none max-md:rounded-b-none",
        widths[size],
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6 max-md:pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id={titleId} className="m-0 text-20 font-bold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="m-0 text-15 text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {hideClose ? null : (
            <Button
              variant="ghost"
              size="md"
              iconOnly
              aria-label={closeLabel}
              onClick={() => onOpenChange(false)}
              className="-mt-2 -mr-2 text-ink-soft hover:text-ink"
            >
              <CloseIcon size={20} />
            </Button>
          )}
        </div>
        {children}
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2.5 max-md:flex-col-reverse max-md:*:w-full">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
