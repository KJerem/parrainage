// Fonctionnalités livrées par les phases suivantes. Tant qu'un drapeau est faux, l'interface
// qui en dépend est masquée : jamais de lien mort ni de bouton sans effet.

export type Feature = "messaging" | "calls" | "receipts" | "expenses";

export const features: Readonly<Record<Feature, boolean>> = {
  /** Phase 4 : « Écrire à… », « Répondre », « Envoyer un encouragement ». */
  messaging: false,
  /** Phase 9 : carte « Prochain appel vidéo », « Demander un appel vidéo ». */
  calls: false,
  /** Phase 10 : « Télécharger mon reçu fiscal ». */
  receipts: false,
  /** Phase 12 : « À quoi a servi votre don ». */
  expenses: false,
};
