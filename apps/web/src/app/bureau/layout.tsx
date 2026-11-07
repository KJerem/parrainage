import { AppSidebarShell } from "@/components/layout";
import { Toaster } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getModerationSummary } from "@/lib/moderation.server";

export default async function BureauLayout({ children }: LayoutProps<"/bureau">) {
  const me = await requireRole("bureau");
  const { pending } = await getModerationSummary();
  return (
    <AppSidebarShell tone="bureau" identity={me.user.name} counts={{ moderation: pending }}>
      {children}
      <Toaster />
    </AppSidebarShell>
  );
}
