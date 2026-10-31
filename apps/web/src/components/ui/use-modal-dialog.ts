"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Garde Tab et Maj+Tab à l'intérieur de `event.currentTarget`. */
export function trapTabKey(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusables = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
  ).filter((element) => element.tabIndex >= 0 && !element.closest("[hidden]"));
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Pilote un `<dialog>` natif en mode modal : ouverture, défilement bloqué, focus rendu au
 * déclencheur, Échap, Tab piégé et clic sur le fond. Partagé par Dialog et Drawer.
 */
export function useModalDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      previous?.focus();
    };
  }, [open]);

  const dialogProps = {
    onCancel(event: SyntheticEvent<HTMLDialogElement>) {
      event.preventDefault();
      onOpenChange(false);
    },
    onClose() {
      // L'événement arrive après coup : on l'ignore si le dialogue a été rouvert entre-temps.
      if (open && !ref.current?.open) onOpenChange(false);
    },
    onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      trapTabKey(event);
    },
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      pressedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      if (pressedOnBackdrop.current && event.target === event.currentTarget) onOpenChange(false);
      pressedOnBackdrop.current = false;
    },
  };

  return { ref, dialogProps };
}
