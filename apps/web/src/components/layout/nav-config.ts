// Entrées de navigation des coquilles : objets simples, transmissibles aux composants client.

export type NavItem = {
  key: string;
  href: string;
  label: string;
  /** Actif uniquement sur l'adresse exacte (pages d'accueil d'un espace). */
  exact?: boolean;
  /** Compteur affiché à droite du libellé (messages non lus, file de modération). */
  count?: number;
  /** Complément lu après le compteur, par ex. « non lus ». */
  countLabel?: string;
};

/** Lien du menu de compte, ou action envoyée en POST (déconnexion). */
export type MenuItem = { label: string; href: string } | { label: string; action: string };

export const logoutItem: MenuItem = { label: "Se déconnecter", action: "/api/auth/logout" };

export const parrainNav = [
  { key: "filleuls", href: "/parrain", label: "Mes filleuls", exact: true },
  { key: "messages", href: "/parrain/messages", label: "Messages", countLabel: "non lus" },
  { key: "appels", href: "/parrain/appels", label: "Appels vidéo" },
  { key: "versements", href: "/parrain/versements", label: "Mes versements" },
] as const satisfies readonly NavItem[];

export type ParrainNavKey = (typeof parrainNav)[number]["key"];

export const parrainAccountMenu: readonly MenuItem[] = [
  { label: "Mon compte", href: "/parrain/compte" },
  logoutItem,
];

export const relaisNav = [
  { key: "accueil", href: "/relais", label: "Accueil", exact: true },
  { key: "enfants", href: "/relais/enfants", label: "Enfants" },
  { key: "ajouter", href: "/relais/enfants/nouveau", label: "Ajouter un enfant" },
  { key: "publier", href: "/relais/publier", label: "Publier une nouvelle" },
  { key: "resultats", href: "/relais/resultats", label: "Résultats scolaires" },
  { key: "messages", href: "/relais/messages", label: "Messages", countLabel: "non lus" },
  { key: "sessions", href: "/relais/sessions", label: "Sessions élèves" },
] as const satisfies readonly NavItem[];

export type RelaisNavKey = (typeof relaisNav)[number]["key"];

export const relaisIdentityMenu: readonly MenuItem[] = [
  { label: "Profil", href: "/relais/profil" },
  { label: "Notifications", href: "/relais/notifications" },
  logoutItem,
];

export const bureauNav = [
  { key: "vue-ensemble", href: "/bureau", label: "Vue d'ensemble", exact: true },
  { key: "binomes", href: "/bureau/binomes", label: "Binômes" },
  {
    key: "moderation",
    href: "/bureau/moderation",
    label: "Modération",
    countLabel: "messages à relire",
  },
  { key: "reseau", href: "/bureau/reseau", label: "Réseau et finances" },
  { key: "parrains", href: "/bureau/parrains", label: "Parrains" },
  { key: "parametres", href: "/bureau/parametres", label: "Paramètres et accès" },
] as const satisfies readonly NavItem[];

export type BureauNavKey = (typeof bureauNav)[number]["key"];

export const bureauIdentityMenu: readonly MenuItem[] = [
  { label: "Profil", href: "/bureau/profil" },
  { label: "Notifications", href: "/bureau/notifications" },
  logoutItem,
];

/** Ajoute les compteurs (`{ messages: 2 }`) aux entrées correspondantes. */
export function withCounts<T extends NavItem>(
  items: readonly T[],
  counts: Partial<Record<string, number>> = {},
): T[] {
  return items.map((item) =>
    counts[item.key] === undefined ? item : { ...item, count: counts[item.key] },
  );
}

/** L'entrée active d'après l'adresse : le plus long préfixe gagne. */
export function findActiveKey(items: readonly NavItem[], pathname: string | null) {
  if (!pathname) return undefined;
  let best: NavItem | undefined;
  for (const item of items) {
    const matches = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key;
}
