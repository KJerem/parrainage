import { RelaisMobileHeader, RelaisMobileTop, RelaisResponsiveShell } from "@/components/layout";
import { Toaster } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getUnreadTotal } from "@/lib/messaging.server";

export default async function RelaisLayout({ children }: LayoutProps<"/relais">) {
  const me = await requireRole("relais");
  const relais = me.relais;
  const name = relais?.displayName ?? me.user.name;
  return (
    <RelaisResponsiveShell
      identity={relais ? `${name} · ${relais.city}, ${relais.district}` : name}
      counts={{ messages: await getUnreadTotal() }}
      mobileHeader={
        <RelaisMobileTop
          home={
            <RelaisMobileHeader
              subtitle={relais ? `Relais · ${relais.city}, quartier ${relais.district}` : "Relais"}
              title={`Bonjour ${name}`}
            />
          }
        />
      }
    >
      {children}
      <Toaster />
    </RelaisResponsiveShell>
  );
}
