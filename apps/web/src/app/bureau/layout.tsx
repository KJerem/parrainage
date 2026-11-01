import { AppSidebarShell } from "@/components/layout";
import { requireRole } from "@/lib/auth.server";

export default async function BureauLayout({ children }: LayoutProps<"/bureau">) {
  const me = await requireRole("bureau");
  return (
    <AppSidebarShell tone="bureau" identity={me.user.name}>
      {children}
    </AppSidebarShell>
  );
}
