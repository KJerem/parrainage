import { ParrainShell } from "@/components/layout";
import { requireRole } from "@/lib/auth.server";

export default async function ParrainLayout({ children }: LayoutProps<"/parrain">) {
  const me = await requireRole("parrain");
  const name = me.parrain?.displayName ?? me.user.name;
  return <ParrainShell user={{ initials: me.user.initials, name }}>{children}</ParrainShell>;
}
