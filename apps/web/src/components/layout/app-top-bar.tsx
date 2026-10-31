"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { MenuIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { Drawer } from "./drawer";

const tones = {
  relais: {
    bar: "bg-brand-700",
    button: "bg-brand-600 hover:bg-brand-900",
    drawer: "bg-brand-700",
  },
  bureau: { bar: "bg-ink", button: "bg-ink-800 hover:bg-black", drawer: "bg-ink" },
} as const;

export type AppTopBarProps = {
  tone: keyof typeof tones;
  title: string;
  /** Nom du tiroir, identique à celui de la navigation qu'il contient. */
  drawerLabel: string;
  /** Contenu du tiroir : le même panneau que la barre latérale. */
  panel: ReactNode;
  /** Media query au-delà de laquelle la barre est masquée : le tiroir se referme alors. */
  closeQuery: string;
  className?: string;
};

/** Barre supérieure h56 des espaces relais et bureau sous lg, avec son tiroir. */
export function AppTopBar({
  tone,
  title,
  drawerLabel,
  panel,
  closeQuery,
  className,
}: AppTopBarProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const styles = tones[tone];

  // Fermeture à chaque navigation (y compris retour arrière).
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(closeQuery);
    const close = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, [open, closeQuery]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 flex min-h-14 items-center gap-2.5 px-4 pt-[env(safe-area-inset-top)] text-white",
          styles.bar,
          className,
        )}
      >
        <Logo tone="accent" />
        <span className="min-w-0 truncate text-16 font-bold">{title}</span>
        <button
          type="button"
          aria-label="Ouvrir le menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => setOpen(true)}
          className={cn(
            "ml-auto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-12 border-0 text-white transition-colors focus-visible:outline-accent-500",
            styles.button,
          )}
        >
          <MenuIcon size={22} />
        </button>
      </header>
      <Drawer
        id={drawerId}
        open={open}
        onOpenChange={setOpen}
        aria-label={drawerLabel}
        className={styles.drawer}
        closeClassName={tone === "relais" ? "hover:bg-brand-600" : "hover:bg-ink-800"}
      >
        {panel}
      </Drawer>
    </>
  );
}
