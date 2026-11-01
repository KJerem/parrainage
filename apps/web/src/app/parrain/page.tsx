import type { Metadata } from "next";
import { Button, Card, EmptyState, UsersIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";

export const metadata: Metadata = { title: "Vos filleuls" };

export default async function ParrainHomePage() {
  const me = await requireRole("parrain");
  const firstName = (me.parrain?.displayName ?? me.user.name).split(/\s+/)[0];
  return (
    <>
      <div>
        <p className="m-0 mb-1 text-15 text-muted">Bonjour {firstName}</p>
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">Vos filleuls</h1>
      </div>
      <Card padding="none">
        <EmptyState
          icon={<UsersIcon size={26} />}
          title="Le suivi de vos filleuls arrive bientôt"
          description="Nouvelles du relais, résultats scolaires, messages et appels vidéo : ces informations s'afficheront ici à la prochaine étape de la plateforme. Votre compte est prêt."
          action={
            <Button href="/parrain/compte" variant="secondary">
              Voir mon compte
            </Button>
          }
        />
      </Card>
    </>
  );
}
