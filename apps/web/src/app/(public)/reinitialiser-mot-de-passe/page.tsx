import type { Metadata } from "next";
import Link from "next/link";
import { FormAlert } from "@/components/auth/form-alert";
import { authLinkClass } from "@/components/auth/link-button";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthSplitLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { authMessages } from "@/lib/auth-errors";
import { firstParam, LOGIN_PATH } from "@/lib/auth-paths";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  // Le jeton figure dans l'adresse : aucune trace dans les en-têtes Referer.
  referrer: "no-referrer",
};

export default async function ReinitialiserMotDePassePage({
  searchParams,
}: PageProps<"/reinitialiser-mot-de-passe">) {
  const params = await searchParams;
  const token = firstParam(params.token);

  // L'API redirige ici avec `?error=INVALID_TOKEN` quand le lien a expiré ou a déjà servi.
  if (!token || firstParam(params.error) !== undefined) {
    return (
      <AuthSplitLayout>
        <div className="flex flex-col gap-4.5">
          <h2 className="m-0 text-28 font-extrabold">Lien expiré</h2>
          <FormAlert>{authMessages.invalidResetLink}</FormAlert>
          <Button href="/mot-de-passe-oublie" size="2xl" fullWidth>
            Demander un nouveau lien
          </Button>
          <p className="m-0 border-t border-line pt-4.5 text-14">
            <Link href={LOGIN_PATH} className={authLinkClass}>
              Retour à la connexion
            </Link>
          </p>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <ResetPasswordForm token={token} />
    </AuthSplitLayout>
  );
}
