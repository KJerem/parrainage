import type { Actor } from "../auth/actor.js";
import type {
  ConversationKind,
  MediaStatus,
  ModerationStatus,
  NewsPostStatus,
  SchoolResultStatus,
} from "../generated/prisma/enums.js";

export type MediaActor = Actor;

/** Enfant concerné par un média : son relais, son consentement et ses parrains actifs. */
export interface MediaChildFacts {
  relaisId: string;
  consentMedia: boolean;
  activeParrainIds: readonly string[];
}

/** Ce qu'il faut savoir d'un média pour décider de son accès (chargé par MediaService). */
export interface MediaFacts {
  status: MediaStatus;
  hasStorage: boolean;
  uploadedByUserId: string | null;
  message: {
    moderationStatus: ModerationStatus;
    conversationKind: ConversationKind;
    /** Parrain du binôme de la conversation, si ce binôme est actif. */
    activeSponsorParrainId: string | null;
    /** Parrain partie à la conversation (échanges avec le relais ou le bureau). */
    parrainId: string | null;
    /** Relais partie à la conversation ou relais de l'enfant concerné. */
    relaisIds: readonly string[];
  } | null;
  newsPost: {
    status: NewsPostStatus;
    relaisId: string;
    /** La nouvelle s'adresse aux parrains (case « Les parrains concernés »). */
    notifyParrains: boolean;
    children: readonly MediaChildFacts[];
  } | null;
  schoolResult: { status: SchoolResultStatus; child: MediaChildFacts } | null;
  /** Photo de profil d'un enfant. */
  avatarOf: MediaChildFacts | null;
  /** Autorisation signée du responsable : jamais montrée à un parrain. */
  consentOf: MediaChildFacts | null;
}

/** Statuts de modération qui rendent un message visible par ses destinataires. */
const DELIVERED: readonly ModerationStatus[] = ["NOT_REQUIRED", "APPROVED", "MASKED"];

/** Conversation enfant ↔ parrain : toujours modérée, seuls ces statuts sont transmis (§8). */
const DELIVERED_AFTER_REVIEW: readonly ModerationStatus[] = ["APPROVED", "MASKED"];

function isDelivered(message: NonNullable<MediaFacts["message"]>): boolean {
  const statuses = message.conversationKind === "SPONSORSHIP" ? DELIVERED_AFTER_REVIEW : DELIVERED;
  return statuses.includes(message.moderationStatus);
}

const sponsors = (child: MediaChildFacts, parrainId: string) =>
  child.activeParrainIds.includes(parrainId);

/** Un parrain ne voit jamais un média d'enfant sans consentement médias. */
const sponsorsWithConsent = (child: MediaChildFacts, parrainId: string) =>
  child.consentMedia && sponsors(child, parrainId);

function parrainCanView(parrainId: string, media: MediaFacts): boolean {
  const { message, newsPost, schoolResult, avatarOf } = media;
  if (message && isDelivered(message)) {
    const party =
      message.conversationKind === "SPONSORSHIP"
        ? message.activeSponsorParrainId === parrainId
        : message.parrainId === parrainId;
    if (party) {
      return true;
    }
  }
  if (
    newsPost?.status === "PUBLISHED" &&
    newsPost.notifyParrains &&
    newsPost.children.some((c) => sponsorsWithConsent(c, parrainId))
  ) {
    return true;
  }
  // Un bulletin est un document scolaire : seul le binôme actif compte.
  if (schoolResult?.status === "SENT" && sponsors(schoolResult.child, parrainId)) {
    return true;
  }
  return avatarOf !== null && sponsorsWithConsent(avatarOf, parrainId);
}

function relaisCanView(relaisId: string, media: MediaFacts): boolean {
  const { message, newsPost, schoolResult, avatarOf, consentOf } = media;
  return (
    consentOf?.relaisId === relaisId ||
    (message !== null && isDelivered(message) && message.relaisIds.includes(relaisId)) ||
    newsPost?.relaisId === relaisId ||
    newsPost?.children.some((c) => c.relaisId === relaisId) === true ||
    schoolResult?.child.relaisId === relaisId ||
    avatarOf?.relaisId === relaisId
  );
}

/**
 * Règle d'accès aux médias (plan §4.4), pure et testée. Elle ne dit oui que s'il existe un
 * fichier à servir : un média PLACEHOLDER ou sans clé de stockage n'est jamais servi.
 * - auteur : toujours (y compris pendant son envoi) ;
 * - bureau : tout média prêt ;
 * - parrain : message approuvé (ou masqué) de son binôme actif, nouvelle publiée d'un filleul
 *   actif qui a le consentement médias, bulletin envoyé d'un filleul actif, photo de profil
 *   d'un filleul actif avec consentement ;
 * - relais : médias de ses enfants, de ses nouvelles et de ses conversations (messages
 *   transmis seulement).
 * Un média en cours d'envoi n'est montré qu'à son auteur ; un média refusé, à personne.
 */
export function canViewMedia(actor: MediaActor, media: MediaFacts): boolean {
  if (!media.hasStorage || media.status === "PLACEHOLDER") {
    return false;
  }
  const isAuthor = media.uploadedByUserId !== null && media.uploadedByUserId === actor.userId;
  if (media.status !== "READY") {
    return isAuthor && media.status === "PENDING_UPLOAD";
  }
  if (isAuthor || actor.role === "bureau") {
    return true;
  }
  if (actor.role === "parrain") {
    return actor.parrainId !== null && parrainCanView(actor.parrainId, media);
  }
  return actor.relaisId !== null && relaisCanView(actor.relaisId, media);
}

/** Le média concerne-t-il un enfant ? (consultation par le bureau : à auditer). */
export function isChildMedia(media: MediaFacts): boolean {
  return (
    media.avatarOf !== null ||
    media.consentOf !== null ||
    media.schoolResult !== null ||
    (media.newsPost?.children.length ?? 0) > 0 ||
    (media.message !== null &&
      (media.message.conversationKind === "SPONSORSHIP" ||
        media.message.conversationKind === "CHILD_ASSOCIATION"))
  );
}
