import type { Metadata } from "next";
import { RelaisMessagesView } from "@/components/messaging/messages-views";
import { NewMessageButton } from "@/components/messaging/new-message-dialog";
import { parseRelaisTab, relaisTabKinds } from "@/components/messaging/relais-tab";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getContacts, getConversations, openConversation } from "@/lib/messaging.server";

export const metadata: Metadata = { title: "Messages" };

// RW-Messages.dc.html : onglets Parrains et Bureau (`?onglet=`). ≥ md : la liste et la
// conversation la plus récente de l'onglet ; < md : la liste seule.
export default async function RelaisMessagesPage({ searchParams }: PageProps<"/relais/messages">) {
  await requireRole("relais");
  const tab = parseRelaisTab(firstParam((await searchParams).onglet));
  const [list, contacts] = await Promise.all([
    getConversations("relais", relaisTabKinds[tab]),
    getContacts("relais"),
  ]);
  const recent = list.items[0];
  const open = recent ? await openConversation("relais", recent.id) : null;
  return (
    <RelaisMessagesView
      mode="index"
      tab={tab}
      items={list.items}
      now={list.now}
      open={open}
      action={<NewMessageButton contacts={contacts.items} />}
    />
  );
}
