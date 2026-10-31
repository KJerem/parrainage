"use client";

import type { ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { cn } from "@/lib/cn";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id?: string;
  "aria-label": string;
  closeLabel?: string;
  className?: string;
  closeClassName?: string;
  children: ReactNode;
};

/**
 * Tiroir latéral de 280 px (`<dialog>` modal) : focus piégé, Échap, clic sur le fond.
 * Un clic sur un lien le referme, même quand la page ne change pas.
 */
export function Drawer({
  open,
  onOpenChange,
  id,
  closeLabel = "Fermer le menu",
  className,
  closeClassName,
  children,
  ...aria
}: DrawerProps) {
  const { ref, dialogProps } = useModalDialog(open, onOpenChange);

  return (
    <dialog
      ref={ref}
      id={id}
      {...aria}
      {...dialogProps}
      onClick={(event) => {
        dialogProps.onClick(event);
        if ((event.target as Element).closest("a[href]")) onOpenChange(false);
      }}
      className={cn(
        "fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[280px] max-w-[calc(100%-48px)] overflow-y-auto border-0 p-0 shadow-drawer backdrop:bg-ink/50",
        className,
      )}
    >
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => onOpenChange(false)}
        className={cn(
          "absolute top-5 right-3 z-10 flex size-11 cursor-pointer items-center justify-center rounded-12 border-0 bg-transparent text-white focus-visible:outline-accent-500",
          closeClassName,
        )}
      >
        <CloseIcon size={22} />
      </button>
      {children}
    </dialog>
  );
}
