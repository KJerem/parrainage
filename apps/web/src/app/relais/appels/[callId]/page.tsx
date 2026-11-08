import type { Metadata } from "next";
import { VisioRoomView } from "@/components/calls/visio-room";
import { requireRole } from "@/lib/auth.server";
import { getVisioRoom } from "@/lib/calls.server";

export const metadata: Metadata = { title: "Salle de l'appel" };

// Salle d'un appel côté relais : son arrivée ouvre la salle au parrain.
export default async function RelaisCallRoomPage({ params }: PageProps<"/relais/appels/[callId]">) {
  const me = await requireRole("relais");
  const { callId } = await params;
  const room = await getVisioRoom(callId, "/relais/appels");
  return (
    <VisioRoomView
      initial={room}
      displayName={me.relais?.displayName ?? me.user.name}
      backHref="/relais/appels"
    />
  );
}
