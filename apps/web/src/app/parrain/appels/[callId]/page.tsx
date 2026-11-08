import type { Metadata } from "next";
import { VisioRoomView } from "@/components/calls/visio-room";
import { BackLink } from "@/components/parrain/back-link";
import { requireRole } from "@/lib/auth.server";
import { getVisioRoom } from "@/lib/calls.server";

export const metadata: Metadata = { title: "Salle de l'appel" };

// Salle d'un appel du parrain : il n'y entre qu'après l'arrivée du relais.
export default async function ParrainCallRoomPage({
  params,
}: PageProps<"/parrain/appels/[callId]">) {
  const me = await requireRole("parrain");
  const { callId } = await params;
  const room = await getVisioRoom(callId, "/parrain/appels");
  return (
    <>
      <BackLink href={`/parrain/appels?filleul=${encodeURIComponent(room.call.childId)}`}>
        Appels vidéo
      </BackLink>
      <VisioRoomView
        initial={room}
        displayName={me.parrain?.displayName ?? me.user.name}
        backHref="/parrain/appels"
      />
    </>
  );
}
