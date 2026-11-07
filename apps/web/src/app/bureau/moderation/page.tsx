import type { Metadata } from "next";
import { ModerationView } from "@/components/moderation/moderation-view";
import { requireRole } from "@/lib/auth.server";
import {
  getModerationDetail,
  getModerationQueue,
  getModerationSummary,
} from "@/lib/moderation.server";

export const metadata: Metadata = { title: "Modération" };

// B-Moderation.dc.html. ≥ md : la file et son premier message ; < md : la file seule.
export default async function BureauModerationPage() {
  await requireRole("bureau");
  const [queue, summary] = await Promise.all([getModerationQueue(), getModerationSummary()]);
  const first = queue.items[0];
  const detail = first ? await getModerationDetail(first.id) : null;
  return <ModerationView queue={queue} summary={summary} detail={detail} mobile="list" />;
}
