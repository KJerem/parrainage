import type { Metadata } from "next";
import { RelaisMobileHeader, RelaisMobileTop, RelaisResponsiveShell } from "@/components/layout";
import { OfflineHeaderBanner, OfflineNotice } from "@/components/relais/offline-status";
import { OutboxProvider } from "@/components/relais/outbox-provider";
import { Toaster } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getUnreadTotal } from "@/lib/messaging.server";

// Seul espace installable : le manifest n'est annoncé qu'ici.
export const metadata: Metadata = {
  manifest: "/relais.webmanifest",
  appleWebApp: { capable: true, title: "LRT Relais" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default async function RelaisLayout({ children }: LayoutProps<"/relais">) {
  const me = await requireRole("relais");
  const relais = me.relais;
  const name = relais?.displayName ?? me.user.name;
  const unread = await getUnreadTotal();
  return (
    <OutboxProvider userId={me.user.id}>
      <RelaisResponsiveShell
        identity={relais ? `${name} · ${relais.city}, ${relais.district}` : name}
        counts={{ messages: unread }}
        mobileHeader={
          <RelaisMobileTop
            home={
              <RelaisMobileHeader
                subtitle={
                  relais ? `Relais · ${relais.city}, quartier ${relais.district}` : "Relais"
                }
                title={`Bonjour ${name}`}
                unreadNotifications={unread}
                banner={<OfflineHeaderBanner />}
              />
            }
          />
        }
      >
        <OfflineNotice />
        {children}
        <Toaster />
      </RelaisResponsiveShell>
    </OutboxProvider>
  );
}
