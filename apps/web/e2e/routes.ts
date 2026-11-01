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
