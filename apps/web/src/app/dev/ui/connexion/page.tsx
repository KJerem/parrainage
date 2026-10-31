import type { Metadata } from "next";
import Link from "next/link";
import { AuthSplitLayout } from "@/components/layout";
import { Button, FormField, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Coquille connexion" };

export default function ConnexionDemoPage() {
  return (
    <AuthSplitLayout>
      <form className="flex flex-col gap-4.5" action="/dev/ui/connexion">
        <h2 className="m-0 text-28 font-extrabold">Se connecter</h2>
        <p className="m-0 text-15 text-muted">
          Espace réservé aux parrains et marraines de l&apos;association.
        </p>
        <FormField label="Adresse e-mail">
          <Input type="email" size="lg" autoComplete="email" />
        </FormField>
        <FormField label="Mot de passe">
          <Input type="password" size="lg" autoComplete="current-password" />
        </FormField>
        <Button type="submit" size="2xl" fullWidth>
          Accéder à mon espace
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-14">
          <Link href="/dev/ui/connexion" className="font-semibold">
            Mot de passe oublié ?
          </Link>
          <Link href="/dev/ui/connexion" className="font-semibold">
            Recevoir un lien par e-mail
          </Link>
        </div>
        <p className="m-0 border-t border-line pt-4.5 text-14 text-ink-soft">
          Pas encore parrain ?{" "}
          <Link href="/dev/ui/connexion" className="font-semibold">
            Découvrir le parrainage
          </Link>
        </p>
      </form>
    </AuthSplitLayout>
  );
}
