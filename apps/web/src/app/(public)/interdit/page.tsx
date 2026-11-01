import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/logout-button";
import { MAIN_ID } from "@/components/layout";
import { Button, Card, LockIcon, Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Accès refusé", robots: { index: false } };

/** Destination des gardes d'espace quand le rôle du compte ne correspond pas (403). */
export default function InterditPage() {
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
        <span className="flex size-14 items-center justify-center rounded-full bg-danger-100 text-danger-600">
          <LockIcon size={26} />
        </span>
        <h1 className="m-0 text-28 font-extrabold">Accès refusé</h1>
        <p className="m-0 text-15 leading-[1.5] text-ink-soft">
          Cette page appartient à un autre espace : votre compte n&apos;y a pas accès. Si vous
          pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez le bureau de
          l&apos;association.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button href="/">Retour à mon espace</Button>
          <LogoutButton label="Changer de compte" />
        </div>
      </Card>
    </main>
  );
}
