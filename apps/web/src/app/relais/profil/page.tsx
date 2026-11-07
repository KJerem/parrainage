import type { Metadata } from "next";
import { SignOutForm } from "@/components/layout/sign-out-form";
import { SchoolsCard } from "@/components/relais/schools-card";
import { Button, Card } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getSchools } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Profil" };

export default async function RelaisProfilePage() {
  const me = await requireRole("relais");
  const { items } = await getSchools();
  const relais = me.relais;
  return (
    <>
      <h1 className="m-0 hidden text-30 font-extrabold md:block">Profil</h1>
      <Card className="flex flex-col gap-1">
        <strong className="text-18">{relais?.displayName ?? me.user.name}</strong>
        {relais ? (
          <span className="text-14 text-ink-soft">
            Relais à {relais.city}, quartier {relais.district}
          </span>
        ) : null}
        <span className="text-14 text-muted">{me.user.email}</span>
      </Card>
      <SchoolsCard schools={items} />
      <Card className="flex flex-col items-start gap-3">
        <div>
          <h2 className="m-0 text-17 font-bold">Se déconnecter</h2>
          <p className="m-0 text-14 text-ink-soft">
            Tout ce qui est gardé sur ce poste pour le mode hors ligne est alors effacé.
          </p>
        </div>
        <SignOutForm action="/deconnexion">
          <Button type="submit" variant="secondary">
            Se déconnecter
          </Button>
        </SignOutForm>
      </Card>
    </>
  );
}
