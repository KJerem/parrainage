import type { Metadata } from "next";
import { AuthSplitLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { LOGIN_PATH } from "@/lib/auth-paths";

export const metadata: Metadata = {
  title: "Découvrir le parrainage",
  description:
    "Parrainer la scolarité d'un enfant au Togo avec l'association LRT : comment ça marche.",
};

const steps = [
  {
    title: "Un enfant, un parrain",
    text: "L'association vous met en relation avec un enfant scolarisé au Togo, à Lomé, Kara ou Kpalimé.",
  },
  {
    title: "Un relais sur place",
    text: "Un relais de l'association suit l'enfant, rencontre sa famille et son école, et vous donne des nouvelles.",
  },
  {
    title: "Un lien suivi",
    text: "Bulletins, messages relus par l'association et appels vidéo depuis la salle du relais : tout se retrouve dans votre espace.",
  },
] as const;

export default function DecouvrirPage() {
  return (
    <AuthSplitLayout
      title="Parrainez la scolarité d'un enfant au Togo."
      description="Un soutien régulier, une relation suivie par l'association et des nouvelles tout au long de l'année scolaire."
    >
      <div className="flex flex-col gap-4.5">
        <h2 className="m-0 text-28 font-extrabold">Le parrainage, comment ça marche ?</h2>
        <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-14 font-bold text-brand-700"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="m-0 text-16 font-bold">{step.title}</h3>
                <p className="m-0 mt-1 text-15 leading-[1.5] text-ink-soft">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="m-0 rounded-12 bg-brand-100 p-3.5 text-14 leading-[1.5]">
          Envie de devenir parrain ou marraine ? Écrivez à l&apos;association :{" "}
          <strong>[ADRESSE DE CONTACT]</strong>. Les comptes sont ouverts par le bureau, après un
          premier échange.
        </p>
        <Button href={LOGIN_PATH} variant="secondary" size="xl" fullWidth>
          Retour à la connexion
        </Button>
      </div>
    </AuthSplitLayout>
  );
}
