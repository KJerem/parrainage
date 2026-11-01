"use client";

import { useEffect } from "react";
import { MAIN_ID } from "@/components/layout/skip-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        <h1 className="m-0 text-28 font-extrabold">Une erreur est survenue</h1>
        <p className="m-0 text-15 leading-[1.5] text-ink-soft">
          Le service est peut-être momentanément indisponible. Réessayez dans quelques instants.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={() => retry()}>Réessayer</Button>
          <Button href="/" variant="secondary">
            Retour à l&apos;accueil
          </Button>
        </div>
      </Card>
    </main>
  );
}
