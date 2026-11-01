import { RelaisMobileHeader, RelaisResponsiveShell } from "@/components/layout";
import { requireRole } from "@/lib/auth.server";

export default async function RelaisLayout({ children }: LayoutProps<"/relais">) {
  const me = await requireRole("relais");
  const relais = me.relais;
  const name = relais?.displayName ?? me.user.name;
  return (
    <RelaisResponsiveShell
      identity={relais ? `${name} · ${relais.city}, ${relais.district}` : name}
      mobileHeader={
        <RelaisMobileHeader
          subtitle={relais ? `Relais · ${relais.city}, quartier ${relais.district}` : "Relais"}
          title={`Bonjour ${name}`}
        />
      }
    >
      {children}
    </RelaisResponsiveShell>
  );
}
