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
  if (pathname.startsWith("/relais/appels/")) {
    return { title: "Appel vidéo", backHref: "/relais/appels", backLabel: "Retour aux appels" };
  }
  if (pathname === "/relais/messages") {
    return { title: "Messages", backHref: "/relais", backLabel: "Retour à l'accueil" };
  }
  const toHome = (title: string): SubHeader => ({
    title,
    backHref: "/relais",
    backLabel: "Retour à l'accueil",
  });
  const toChildren = (title: string): SubHeader => ({
    title,
    backHref: "/relais/enfants",
    backLabel: "Retour aux enfants",
  });
  if (pathname === "/relais/enfants/nouveau") {
    return toChildren("Ajouter un enfant");
  }
  if (pathname.startsWith("/relais/enfants/")) {
    return toChildren("Fiche de l'enfant");
  }
  const titles: Readonly<Record<string, string>> = {
    "/relais/enfants": "Enfants",
    "/relais/publier": "Nouvelle publication",
    "/relais/resultats": "Saisir des résultats",
    "/relais/profil": "Profil",
    "/relais/notifications": "Notifications",
    "/relais/sessions": "Sessions élèves",
    "/relais/appels": "Appels vidéo",
  };
  const title = titles[pathname];
  return title ? toHome(title) : null;
}

/**
 * En-tête de l'appli relais sous md (plan §6) : en-tête vert sur l'accueil, sous-en-tête blanc
 * avec retour sur les autres écrans. Une page encore inconnue garde l'en-tête de l'accueil.
 */
export function RelaisMobileTop({ home }: { home: ReactNode }) {
  const subHeader = subHeaderOf(usePathname() ?? "");
  return subHeader ? <MobileSubHeader {...subHeader} /> : home;
}
