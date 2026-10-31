import { devRoutes } from "../src/app/dev/ui/routes";

// Pages contrôlées par les tests transverses (axe, débordement horizontal).
export const e2eRoutes: { path: string; title: string }[] = [
  { path: "/", title: "Accueil" },
  ...devRoutes,
];
