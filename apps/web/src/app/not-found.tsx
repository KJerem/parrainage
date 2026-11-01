import type { Metadata } from "next";
import { MAIN_ID } from "@/components/layout";
import { Button, Card, Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <main
      id={MAIN_ID}
      tabIndex={-1}
      className="flex flex-1 items-center justify-center p-4 focus:outline-none md:p-6"
    >
      <Card padding="xl" className="flex w-full max-w-[480px] flex-col items-start gap-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-17 font-bold">Parrainage</span>
        </div>
        <h1 className="m-0 text-28 font-extrabold">Page introuvable</h1>
        <p className="m-0 text-15 leading-[1.5] text-ink-soft">
          Cette adresse ne correspond à aucune page, ou la page n&apos;est pas encore disponible.
        </p>
        <Button href="/">Retour à l&apos;accueil</Button>
      </Card>
    </main>
  );
}
