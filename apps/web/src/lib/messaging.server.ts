import "server-only";
import {
  contactListSchema,
  conversationDetailSchema,
  conversationListSchema,
  messagePageSchema,
  roleHome,
  unreadCountSchema,
  type ContactList,
  type ConversationDetail,
  type ConversationKind,
  type ConversationList,
  type MessagePage,
  type Role,
} from "@parrainage/contracts";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { z } from "zod";
import { api } from "./api.server";
import { FORBIDDEN_PATH, loginPath } from "./auth-paths";
import { NOT_FOUND_TITLE } from "./parrain.server";

type MessagingRole = Extract<Role, "parrain" | "relais">;

/**
 * GET de la messagerie, validé par son contrat. Conversation inaccessible (404 de l'API, y
 * compris celle d'un autre parrain) : page introuvable. Session expirée : retour à la connexion.
 */
async function getMessaging<T>(role: MessagingRole, path: string, schema: z.ZodType<T>) {
  const response = await api(path);
  if (response.status === 404) {
    notFound();
  }
  if (response.status === 401) {
    redirect(loginPath(roleHome[role]));
  }
  if (response.status === 403) {
    redirect(FORBIDDEN_PATH);
  }
  if (!response.ok) {
    throw new Error(`GET ${path} a répondu ${response.status}`);
  }
  return schema.parse(await response.json());
}

const conversationPath = (id: string) => `/api/conversations/${encodeURIComponent(id)}`;

/** Conversations de l'acteur, de la plus récente à la plus ancienne (filtre par type). */
export function getConversations(
  role: MessagingRole,
  kinds?: readonly ConversationKind[],
): Promise<ConversationList> {
  const query = kinds?.length ? `?${new URLSearchParams({ kind: kinds.join(",") })}` : "";
  return getMessaging(role, `/api/conversations${query}`, conversationListSchema);
}

/**
 * En-tête et droits d'une conversation, ou `null` si elle est inaccessible (404 de l'API).
 * Mémorisé : `generateMetadata` et la page partagent un seul appel.
 */
export const findConversation = cache(
  async (role: MessagingRole, id: string): Promise<ConversationDetail | null> => {
    const response = await api(conversationPath(id));
    if (response.status === 404) {
      return null;
    }
    if (response.status === 401) {
      redirect(loginPath(roleHome[role]));
    }
    if (response.status === 403) {
      redirect(FORBIDDEN_PATH);
    }
    if (!response.ok) {
      throw new Error(`GET ${conversationPath(id)} a répondu ${response.status}`);
    }
    return conversationDetailSchema.parse(await response.json());
  },
);

/** Titre de l'onglet d'une conversation (« Conversation avec Aïcha »), ou celui d'une page introuvable. */
export async function conversationTitle(role: MessagingRole, id: string): Promise<string> {
  const detail = await findConversation(role, id);
  return detail ? `Conversation avec ${detail.counterpart.shortName}` : NOT_FOUND_TITLE;
}

/** En-tête et dernière page d'une conversation ouverte ; inaccessible : page introuvable. */
export async function openConversation(
  role: MessagingRole,
  id: string,
): Promise<{ detail: ConversationDetail; page: MessagePage }> {
  const [detail, page] = await Promise.all([findConversation(role, id), getMessagePage(role, id)]);
  if (!detail) {
    notFound();
  }
  return { detail, page };
}

/** Dernière page de messages (du plus ancien au plus récent). */
export function getMessagePage(role: MessagingRole, id: string): Promise<MessagePage> {
  return getMessaging(role, `${conversationPath(id)}/messages`, messagePageSchema);
}

/** Personnes à qui l'acteur peut écrire (« Nouveau message »). */
export function getContacts(role: MessagingRole): Promise<ContactList> {
  return getMessaging(role, "/api/conversations/contacts", contactListSchema);
}

/**
 * Total des messages non lus, pour les pastilles de navigation. Une panne de l'API ne doit pas
 * casser la coquille : la pastille disparaît simplement.
 */
export const getUnreadTotal = cache(async (): Promise<number> => {
  try {
    const response = await api("/api/conversations/unread-count");
    if (!response.ok) {
      return 0;
    }
    return unreadCountSchema.parse(await response.json()).total;
  } catch {
    return 0;
  }
});
