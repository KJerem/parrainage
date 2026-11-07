"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ELEVE_HOME } from "@/lib/auth-paths";
import { forgetOfflinePages } from "@/lib/offline-purge";

/**
 * Aucun service worker ni page gardée sur le poste des élèves : l'espace relais a pu en laisser,
 * et une page d'enfant ne doit jamais sortir d'un cache.
 */
export function NoServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => undefined);
    }
    void forgetOfflinePages().catch(() => undefined);
  }, []);
  return null;
}

const leave = () => window.location.replace(ELEVE_HOME);

/** Vérification régulière : une session fermée par le relais ne reste pas affichée sur le poste. */
const WATCH_INTERVAL_MS = 30_000;

/**
 * Renvoie l'enfant à la connexion à la fin de la session, ou dès que l'API le refuse. L'API reste
 * seule juge : ceci évite seulement de laisser un écran ouvert sur un poste partagé.
 */
export function SessionWatch({ endsAt, now }: { endsAt: string; now: string }) {
  useEffect(() => {
    const end = setTimeout(leave, Math.max(0, Date.parse(endsAt) - Date.parse(now)));
    const check = () => {
      void fetch("/api/eleve/me", { cache: "no-store", credentials: "same-origin" })
        .then((response) => {
          if (response.status === 401) {
            leave();
          }
        })
        .catch(() => undefined);
    };
    const poll = setInterval(check, WATCH_INTERVAL_MS);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(end);
      clearInterval(poll);
      window.removeEventListener("focus", check);
    };
  }, [endsAt, now]);
  return null;
}

/** « J'ai fini » : l'enfant est déconnecté, le poste reste ouvert pour le suivant. */
export function FinishButton({
  variant = "kid-outline",
  size,
  className,
}: {
  variant?: "kid-outline" | "kid-primary";
  size?: "kid-sm" | "kid" | "kid-lg";
  className?: string;
}) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={leaving}
      onClick={() => {
        setLeaving(true);
        void fetch("/api/eleve/logout", { method: "POST", credentials: "same-origin" })
          .catch(() => undefined)
          .finally(leave);
      }}
    >
      J&apos;ai fini
    </Button>
  );
}
