import { callIcsPath, type NextCall } from "@parrainage/contracts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { nextCallLines } from "./call-labels";

/**
 * Carte « Prochain appel vidéo » de Main : l'appel confirmé (avec son fichier agenda), ou la
 * demande en cours. Sous lg, une copie s'affiche après le profil (plan, section 6).
 */
export function NextCallCard({
  call,
  childId,
  className,
}: {
  call: NextCall;
  childId: string;
  className?: string;
}) {
  const { title, when, detail } = nextCallLines(call);
  const callsHref = `/parrain/appels?filleul=${encodeURIComponent(childId)}`;
  return (
    <Card
      as="section"
      variant="brand"
      padding="lg"
      aria-label={title}
      className={cn("flex flex-col gap-2.5", className)}
    >
      <h2 className="m-0 text-14 font-semibold text-brand-200">{title}</h2>
      {when ? <p className="m-0 text-22 font-extrabold">{when}</p> : null}
      <p className="m-0 text-14 text-brand-200">{detail}</p>
      {call.state === "confirmed" && call.callId ? (
        <Button href={callIcsPath(call.callId)} variant="accent" className="mt-1.5">
          Ajouter à mon agenda
        </Button>
      ) : (
        <Button href={callsHref} variant="accent" className="mt-1.5">
          {call.state === "proposed" ? "Choisir un créneau" : "Voir ma demande"}
        </Button>
      )}
    </Card>
  );
}
