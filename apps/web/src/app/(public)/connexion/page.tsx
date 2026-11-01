import { roleHome } from "@parrainage/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { AuthSplitLayout } from "@/components/layout";
import { getMe } from "@/lib/api.server";
import { authMessages } from "@/lib/auth-errors";
import { firstParam, safeNextPath } from "@/lib/auth-paths";

export const metadata: Metadata = { title: "Connexion" };

// `?espace=` ne change que le sous-titre : la connexion est la même pour tous les rôles.
const subtitles = {
  parrain: "Espace réservé aux parrains et marraines de l'association.",
  relais: "Espace réservé aux relais de l'association.",
  bureau: "Espace réservé aux membres du bureau de l'association.",
} as const;

export default async function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));

  // Déjà connecté : directement vers la destination ou l'espace du rôle. API injoignable :
  // le formulaire s'affiche et signalera l'indisponibilité.
  const me = await getMe().catch(() => null);
  if (me) {
    redirect(next ?? roleHome[me.user.role]);
  }

  const espace = firstParam(params.espace);
  const subtitle =
    espace === "relais" || espace === "bureau" ? subtitles[espace] : subtitles.parrain;
  const linkError = firstParam(params.error) ? authMessages.invalidMagicLink : undefined;

  return (
    <AuthSplitLayout>
      <LoginForm next={next} subtitle={subtitle} linkError={linkError} />
    </AuthSplitLayout>
  );
}
