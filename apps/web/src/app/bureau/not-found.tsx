import type { Metadata } from "next";
import { Button, Card } from "@/components/ui";
import { NOT_FOUND_TITLE } from "@/lib/parrain.server";

export const metadata: Metadata = { title: NOT_FOUND_TITLE };

// Dans la coquille du bureau : message hors de la modération, ou page inexistante.
export default function BureauNotFound() {
  return (
    <Card padding="xl" className="flex w-full max-w-[560px] flex-col items-start gap-4">
      <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-30">
        {NOT_FOUND_TITLE}
      </h1>
      <p className="m-0 text-15 leading-[1.5] text-ink-soft">
        Cette page n&apos;existe pas, ou elle ne fait pas partie de l&apos;espace du bureau.
      </p>
      <Button href="/bureau">Retour à la vue d&apos;ensemble</Button>
    </Card>
  );
}
