import { devRoutes } from "../src/app/dev/ui/routes";

// Pages publiques contrôlées par les tests transverses (axe, débordement horizontal). Les
// espaces connectés sont vérifiés dans auth.spec.ts, après connexion.
export const e2eRoutes: { path: string; title: string }[] = [
  { path: "/connexion", title: "Connexion" },
  { path: "/mot-de-passe-oublie", title: "Mot de passe oublié" },
  { path: "/reinitialiser-mot-de-passe", title: "Lien de réinitialisation expiré" },
  { path: "/decouvrir", title: "Découvrir le parrainage" },
  { path: "/interdit", title: "Accès refusé" },
  ...devRoutes,
];

// Identifiants stables du seed (apps/api/prisma/seed/data.ts).
export const AICHA = "seed-child-aicha";
export const KOFI = "seed-child-kofi";
/** Filleul de Marc P. : jamais visible pour Claire. */
export const YAO = "seed-child-yao";

// Pages de l'espace parrain, vérifiées connecté en tant que Claire (axe, débordement).
export const parrainRoutes: { path: string; title: string }[] = [
  { path: "/parrain", title: "Vos filleuls (Aïcha)" },
  { path: `/parrain?filleul=${KOFI}`, title: "Vos filleuls (Kofi)" },
  { path: `/parrain/nouvelles?filleul=${AICHA}`, title: "Tout le fil" },
  { path: `/parrain/filleuls/${AICHA}/bulletins`, title: "Bulletins d'Aïcha" },
  { path: "/parrain/messages", title: "Messages" },
  { path: "/parrain/appels", title: "Appels vidéo" },
  { path: "/parrain/versements", title: "Mes versements" },
  { path: "/parrain/compte", title: "Mon compte" },
];
