import { ParrainShell } from "@/components/layout";
import { Toaster } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getUnreadTotal } from "@/lib/messaging.server";

export default async function ParrainLayout({ children }: LayoutProps<"/parrain">) {
  const me = await requireRole("parrain");
  const name = me.parrain?.displayName ?? me.user.name;
  return (
    <ParrainShell
      user={{ initials: me.user.initials, name }}
      unreadMessages={await getUnreadTotal()}
    >
      {children}
      <Toaster />
    </ParrainShell>
  );
}
