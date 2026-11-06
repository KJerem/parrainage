import type { Metadata } from "next";
import { ParrainMessagesView } from "@/components/messaging/messages-views";
import { requireRole } from "@/lib/auth.server";
import { conversationTitle, getConversations, openConversation } from "@/lib/messaging.server";

export async function generateMetadata({
  params,
}: PageProps<"/parrain/messages/[conversationId]">): Promise<Metadata> {
  return { title: await conversationTitle("parrain", (await params).conversationId) };
}

// P-Messages.dc.html, une conversation ouverte. < md : le fil seul, avec un retour à la liste.
// Conversation d'un autre parrain (ou d'un binôme terminé) : page introuvable.
export default async function ParrainConversationPage({
  params,
}: PageProps<"/parrain/messages/[conversationId]">) {
  await requireRole("parrain");
  const { conversationId } = await params;
  const [list, open] = await Promise.all([
    getConversations("parrain"),
    openConversation("parrain", conversationId),
  ]);
  return <ParrainMessagesView mode="thread" list={list} open={open} />;
}
