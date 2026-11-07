import type { Metadata } from "next";
import { PublishScreen } from "@/components/relais/publish-form";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { getRelaisChildren, getScheduledNews } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Publier une nouvelle" };

// RW-Publier.dc.html. `?enfant=` : depuis le lien « Publier » d'un enfant.
export default async function RelaisPublishPage({ searchParams }: PageProps<"/relais/publier">) {
  const me = await requireRole("relais");
  const [{ items, now }, scheduled] = await Promise.all([getRelaisChildren(), getScheduledNews()]);
  return (
    <PublishScreen
      // Un brouillon n'est pas encore un enfant suivi : il ne reçoit pas de nouvelle.
      followed={items.filter((child) => child.fileStatus !== "DRAFT")}
      scheduled={scheduled.items}
      relaisName={me.relais?.displayName ?? me.user.name}
      relaisCity={me.relais?.city ?? ""}
      initialChildId={firstParam((await searchParams).enfant) ?? null}
      now={now}
    />
  );
}
