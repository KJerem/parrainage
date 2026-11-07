import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RelaisMessagesView } from "@/components/messaging/messages-views";
import { NewMessageButton } from "@/components/messaging/new-message-dialog";
import { relaisTabKinds, relaisTabOf, visibleRelaisTabs } from "@/components/messaging/relais-tab";
import { requireRole } from "@/lib/auth.server";
import {
  conversationTitle,
  getContacts,
  getConversations,
  openConversation,
} from "@/lib/messaging.server";

export async function generateMetadata({
  params,
}: PageProps<"/relais/messages/[conversationId]">): Promise<Metadata> {
  return { title: await conversationTitle("relais", (await params).conversationId) };
}

// RW-Messages.dc.html, une conversation ouverte, dans son onglet. < md : le fil seul.
export default async function RelaisConversationPage({
  params,
}: PageProps<"/relais/messages/[conversationId]">) {
  await requireRole("relais");
  const { conversationId } = await params;
  const open = await openConversation("relais", conversationId);
  const tab = relaisTabOf(open.detail.kind);
  if (!visibleRelaisTabs().includes(tab)) {
    notFound();
  }
  const [list, contacts] = await Promise.all([
    getConversations("relais", relaisTabKinds[tab]),
    getContacts("relais"),
  ]);
  return (
    <RelaisMessagesView
      mode="thread"
      tab={tab}
      items={list.items}
      now={list.now}
      open={open}
      action={<NewMessageButton contacts={contacts.items} />}
    />
  );
}
