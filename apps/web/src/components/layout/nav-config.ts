// Entrées de navigation des coquilles : objets simples, transmissibles aux composants client.

export type NavItem = {
  key: string;
  href: string;
  label: string;
  /** Actif uniquement sur l'adresse exacte (pages d'accueil d'un espace). */
  exact?: boolean;
  /** Autres rubriques rattachées à l'entrée, sous-pages comprises (« Tout le fil »). */
  subPaths?: readonly string[];
  /** Compteur affiché à droite du libellé (messages non lus, file de modération). */
  count?: number;
  /** Complément lu après le compteur, par ex. « non lus ». */
  countLabel?: string;
  /** Le même au singulier (« non lu »), lu quand le compteur vaut 1. */
  countLabelOne?: string;
};

/** Lien du menu de compte, ou action envoyée en POST (déconnexion). */
export type MenuItem = { label: string; href: string } | { label: string; action: string };

/** Formulaire POST traité par src/app/deconnexion/route.ts : fonctionne sans JavaScript. */
export const LOGOUT_ACTION = "/deconnexion";

export const logoutItem: MenuItem = { label: "Se déconnecter", action: LOGOUT_ACTION };

export const parrainNav = [
  {
    key: "filleuls",
    href: "/parrain",
    label: "Mes filleuls",
    exact: true,
    subPaths: ["/parrain/nouvelles", "/parrain/filleuls"],
  },
  {
    key: "messages",
    href: "/parrain/messages",
    label: "Messages",
    countLabel: "non lus",
    countLabelOne: "non lu",
  },
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
  {
    key: "messages",
    href: "/relais/messages",
    label: "Messages",
    countLabel: "non lus",
    countLabelOne: "non lu",
  },
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
    countLabelOne: "message à relire",
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

/** Complément du compteur, accordé : « 1 non lu », « 2 non lus ». */
export function countLabelFor(item: NavItem): string | undefined {
  return item.count === 1 ? (item.countLabelOne ?? item.countLabel) : item.countLabel;
}

/** Ajoute les compteurs (`{ messages: 2 }`) aux entrées correspondantes. */
export function withCounts<T extends NavItem>(
  items: readonly T[],
  counts: Partial<Record<string, number>> = {},
): T[] {
  return items.map((item) =>
    counts[item.key] === undefined ? item : { ...item, count: counts[item.key] },
  );
}

/** Longueur du plus long préfixe de l'entrée qui couvre l'adresse, -1 sinon. */
function matchLength(item: NavItem, pathname: string): number {
  if (item.exact && pathname === item.href) return item.href.length;
  const prefixes = [...(item.exact ? [] : [item.href]), ...(item.subPaths ?? [])];
  return prefixes
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .reduce((longest, prefix) => Math.max(longest, prefix.length), -1);
}

/** L'entrée active d'après l'adresse : le plus long préfixe gagne. */
export function findActiveKey(items: readonly NavItem[], pathname: string | null) {
  if (!pathname) return undefined;
  let best: { key: string; length: number } | undefined;
  for (const item of items) {
    const length = matchLength(item, pathname);
    if (length >= 0 && (!best || length > best.length)) best = { key: item.key, length };
  }
  return best?.key;
}
