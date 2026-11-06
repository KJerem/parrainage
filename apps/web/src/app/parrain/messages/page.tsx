import type { Metadata } from "next";
import { ParrainMessagesView } from "@/components/messaging/messages-views";
import { requireRole } from "@/lib/auth.server";
import { getConversations, openConversation } from "@/lib/messaging.server";

export const metadata: Metadata = { title: "Messages" };

// P-Messages.dc.html. ≥ md : la liste et la conversation la plus récente ; < md : la liste seule.
export default async function ParrainMessagesPage() {
  await requireRole("parrain");
  const list = await getConversations("parrain");
  const recent = list.items[0];
  const open = recent ? await openConversation("parrain", recent.id) : null;
  return <ParrainMessagesView mode="index" list={list} open={open} />;
}
