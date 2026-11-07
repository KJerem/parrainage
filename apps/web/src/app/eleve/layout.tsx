import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NoServiceWorker } from "@/components/eleve/eleve-chrome";

export const metadata: Metadata = {
  title: { default: "Écrire à mon parrain", template: "%s · Espace élève" },
  robots: { index: false, follow: false },
};

/** Espace enfant : hors comptes adultes, chaque page vérifie la session élève auprès de l'API. */
export default function EleveLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NoServiceWorker />
      {children}
    </>
  );
}
