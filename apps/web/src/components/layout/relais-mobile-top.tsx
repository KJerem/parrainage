"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MobileSubHeader } from "./relais-mobile";

type SubHeader = { title: string; backHref: string; backLabel: string };

/** Écrans relais secondaires : titre du sous-en-tête blanc et page de retour. */
function subHeaderOf(pathname: string): SubHeader | null {
  if (pathname.startsWith("/relais/messages/")) {
    return {
      title: "Messages",
      backHref: "/relais/messages",
      backLabel: "Retour aux conversations",
    };
  }
  if (pathname === "/relais/messages") {
    return { title: "Messages", backHref: "/relais", backLabel: "Retour à l'accueil" };
  }
  return null;
}

/**
 * En-tête de l'appli relais sous md (plan §6) : en-tête vert sur l'accueil, sous-en-tête blanc
 * avec retour sur les autres écrans. Une page encore inconnue garde l'en-tête de l'accueil.
 */
export function RelaisMobileTop({ home }: { home: ReactNode }) {
  const subHeader = subHeaderOf(usePathname() ?? "");
  return subHeader ? <MobileSubHeader {...subHeader} /> : home;
}
