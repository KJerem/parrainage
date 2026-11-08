// Fonctionnalités livrées par les phases suivantes. Tant qu'un drapeau est faux, l'interface
// qui en dépend est masquée : jamais de lien mort ni de bouton sans effet.

export type Feature = "messaging" | "calls" | "receipts" | "expenses" | "childConversations";

export const features: Readonly<Record<Feature, boolean>> = {
  /** Phase 4 : « Écrire à… », « Répondre », « Envoyer un encouragement », Messages. */
  messaging: true,
  /** Phase 9 : carte « Prochain appel vidéo », « Demander un appel vidéo », « Proposer un appel
   * vidéo » et la réponse rapide aux demandes d'appel (RW-Messages). */
  calls: true,
  /** Phase 10 : « Télécharger mon reçu fiscal ». */
  receipts: false,
  /** Phase 12 : « À quoi a servi votre don ». */
  expenses: false,
  /** Phase 8 : onglet « Enfants » de RW-Messages (conversations des enfants suivis). */
  childConversations: true,
};
