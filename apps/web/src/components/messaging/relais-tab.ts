import type { ConversationKind } from "@parrainage/contracts";
import { features } from "@/lib/features";

/** Onglets de RW-Messages (`?onglet=`) ; « Enfants » attend la phase 8. */
export const relaisTabs = ["parrains", "bureau", "enfants"] as const;

export type RelaisTab = (typeof relaisTabs)[number];

export const relaisTabLabels: Record<RelaisTab, string> = {
  parrains: "Parrains",
  bureau: "Bureau",
  enfants: "Enfants",
};

/** Types de conversation de chaque onglet (filtre `?kind=` de l'API). */
export const relaisTabKinds: Record<RelaisTab, readonly ConversationKind[]> = {
  parrains: ["PARRAIN_RELAIS"],
  bureau: ["RELAIS_BUREAU"],
  enfants: ["SPONSORSHIP", "CHILD_ASSOCIATION"],
};

/** Onglets disponibles dans cette phase. */
export function visibleRelaisTabs(): RelaisTab[] {
  return relaisTabs.filter((tab) => tab !== "enfants" || features.childConversations);
}

/** Onglet demandé dans l'adresse, sinon « Parrains ». */
export function parseRelaisTab(value: string | undefined): RelaisTab {
  return visibleRelaisTabs().find((tab) => tab === value) ?? "parrains";
}

/** Onglet d'une conversation. */
export function relaisTabOf(kind: ConversationKind): RelaisTab {
  return relaisTabs.find((tab) => relaisTabKinds[tab].includes(kind)) ?? "parrains";
}
