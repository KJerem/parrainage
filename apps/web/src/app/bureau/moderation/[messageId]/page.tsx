import type { Metadata } from "next";
import { partiesLabel } from "@/components/moderation/moderation-labels";
import { ModerationView } from "@/components/moderation/moderation-view";
import { requireRole } from "@/lib/auth.server";
import {
  getModerationDetail,
  getModerationQueue,
  getModerationSummary,
} from "@/lib/moderation.server";

type Props = PageProps<"/bureau/moderation/[messageId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await getModerationDetail((await params).messageId);
  return { title: `Modération : ${partiesLabel(detail)}` };
}

// B-Moderation.dc.html : le message relu, à côté de la file à partir de md.
export default async function BureauModerationMessagePage({ params }: Props) {
  await requireRole("bureau");
  const { messageId } = await params;
  const [queue, summary, detail] = await Promise.all([
    getModerationQueue(),
    getModerationSummary(),
    getModerationDetail(messageId),
  ]);
  return <ModerationView queue={queue} summary={summary} detail={detail} mobile="detail" />;
}
