import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FinishButton, SessionWatch } from "@/components/eleve/eleve-chrome";
import { sentSentence, sentSteps, type SentStep } from "@/components/eleve/eleve-labels";
import { KidShell } from "@/components/layout";
import { Avatar, Button, CheckIcon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getEleveHome, getEleveSent } from "@/lib/eleve.server";
import { formatHour, RELAIS_TIME_ZONE } from "@/lib/format";

export const metadata: Metadata = { title: "Bravo" };

const stepTones: Readonly<Record<SentStep["state"], string>> = {
  done: "bg-brand-700 text-white",
  current: "bg-accent-100 text-accent-700",
  todo: "bg-canvas text-ink-soft",
};

// E-Envoye.dc.html : réservé à l'auteur du message (l'API répond 404 sinon).
export default async function EleveEnvoyePage({ searchParams }: PageProps<"/eleve/envoye">) {
  const { m } = await searchParams;
  if (typeof m !== "string" || m === "") {
    redirect("/eleve/messages");
  }
  const [home, sent] = await Promise.all([getEleveHome(), getEleveSent(m)]);
  return (
    <KidShell
      title={`Bonjour ${home.child.firstName} !`}
      leading={<Avatar size={48} tone={home.child.avatarTone} initials={home.child.initials} />}
      session={`Session ouverte par ${home.relaisName} · se ferme à ${formatHour(home.endsAt, RELAIS_TIME_ZONE)}`}
      sessionIcon={false}
      mainClassName="items-center"
    >
      <SessionWatch endsAt={home.endsAt} now={home.now} />
      <section className="flex w-full max-w-[640px] flex-col items-center gap-5 rounded-28 border border-kid-line bg-white px-10 py-12 text-center max-sm:px-5 max-sm:py-8">
        <span className="flex size-28 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <CheckIcon size={56} />
        </span>
        <h1 className="m-0 text-28 font-extrabold sm:text-36">Bravo {home.child.firstName} !</h1>
        <p className="m-0 text-20 leading-[1.5]">{sentSentence(sent)}</p>
        <ol className="m-0 flex list-none flex-wrap items-center justify-center gap-2 p-0">
          {sentSteps(sent).map((step) => (
            <li
              key={step.label}
              className={cn("rounded-12 px-3.5 py-2 text-16 font-bold", stepTones[step.state])}
            >
              {step.label}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-center gap-3 max-sm:w-full">
          <Button href="/eleve/messages" variant="kid-primary" className="max-sm:w-full">
            Écrire autre chose
          </Button>
          <FinishButton size="kid" className="max-sm:w-full" />
        </div>
      </section>
    </KidShell>
  );
}
