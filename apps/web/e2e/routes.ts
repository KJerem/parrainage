import { devRoutes } from "../src/app/dev/ui/routes";

// Pages publiques contrôlées par les tests transverses (axe, débordement horizontal). Les
// espaces connectés sont vérifiés dans auth.spec.ts, après connexion.
export const e2eRoutes: { path: string; title: string }[] = [
  { path: "/connexion", title: "Connexion" },
  { path: "/mot-de-passe-oublie", title: "Mot de passe oublié" },
  { path: "/reinitialiser-mot-de-passe", title: "Lien de réinitialisation expiré" },
  { path: "/decouvrir", title: "Découvrir le parrainage" },
  { path: "/interdit", title: "Accès refusé" },
  { path: "/hors-ligne", title: "Hors ligne" },
  ...devRoutes,
];

// Identifiants stables du seed (apps/api/prisma/seed/data.ts).
export const AICHA = "seed-child-aicha";
export const KOFI = "seed-child-kofi";
/** Filleul de Marc P. : jamais visible pour Claire. */
export const YAO = "seed-child-yao";

// Conversations du seed (apps/api/prisma/seed/content.ts).
export const AICHA_CONVERSATION = "seed-conversation-aicha-claire";
export const CLAIRE_KOFFI_CONVERSATION = "seed-conversation-claire-koffi";
export const KOFFI_BUREAU_CONVERSATION = "seed-conversation-koffi-bureau";

// Pages de l'espace parrain, vérifiées connecté en tant que Claire (axe, débordement).
export const parrainRoutes: { path: string; title: string }[] = [
  { path: "/parrain", title: "Vos filleuls (Aïcha)" },
  { path: `/parrain?filleul=${KOFI}`, title: "Vos filleuls (Kofi)" },
  { path: `/parrain/nouvelles?filleul=${AICHA}`, title: "Tout le fil" },
  { path: `/parrain/filleuls/${AICHA}/bulletins`, title: "Bulletins d'Aïcha" },
  { path: "/parrain/messages", title: "Messages" },
  { path: `/parrain/messages/${AICHA_CONVERSATION}`, title: "Conversation avec Aïcha" },
  { path: `/parrain/messages/${CLAIRE_KOFFI_CONVERSATION}`, title: "Conversation avec M. Koffi" },
  { path: "/parrain/appels", title: "Appels vidéo" },
  { path: "/parrain/versements", title: "Mes versements" },
  { path: "/parrain/compte", title: "Mon compte" },
];

// Pages de l'espace relais, vérifiées connecté en tant que M. Koffi (axe, débordement).
export const relaisRoutes: { path: string; title: string }[] = [
  { path: "/relais", title: "Accueil relais" },
  { path: "/relais/messages", title: "Messages" },
  { path: "/relais/messages?onglet=bureau", title: "Messages" },
  { path: `/relais/messages/${CLAIRE_KOFFI_CONVERSATION}`, title: "Conversation avec Claire M." },
  { path: "/relais/sessions", title: "Rubrique à venir" },
  { path: "/relais/profil", title: "Profil" },
  { path: "/relais/notifications", title: "Notifications" },
  { path: "/relais/enfants", title: "Enfants" },
  { path: "/relais/enfants/nouveau", title: "Ajouter un enfant" },
  { path: "/relais/enfants/seed-child-esther", title: "Fiche d'Esther" },
  { path: "/relais/enfants/seed-child-aicha", title: "Fiche d'Aïcha" },
  { path: "/relais/publier", title: "Publier une nouvelle" },
  { path: "/relais/publier?enfant=seed-child-koffi-2", title: "Publier (sans consentement)" },
  { path: "/relais/resultats", title: "Résultats scolaires" },
];

// Pages de l'espace bureau, vérifiées connecté (axe, débordement).
export const bureauRoutes: { path: string; title: string }[] = [
  { path: "/bureau", title: "Vue d'ensemble" },
  { path: "/bureau?filtre=signales", title: "Vue d'ensemble (signalés)" },
  { path: "/bureau/moderation", title: "Modération" },
  { path: "/bureau/moderation/seed-message-attente-paul", title: "Message avec alerte" },
  { path: "/bureau/moderation/seed-message-attente-mariam", title: "Message avec vidéo" },
  { path: "/bureau/moderation/seed-message-attente-aicha", title: "Message avec bulletin" },
  { path: "/bureau/binomes", title: "Rubrique à venir" },
];
