import type { Metadata } from "next";
import { KidShell, TwoColumnParrain } from "@/components/layout";
import { Avatar, Button, Card, FormField, SendIcon, ShieldIcon, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Coquille enfant" };

export default function EnfantDemoPage() {
  return (
    <KidShell
      title="Bonjour Aïcha !"
      leading={<Avatar tone="amber" initials="AS" size={48} />}
      session="Session ouverte par M. Koffi · se ferme à 16 h 00"
      finishHref="/dev/ui"
    >
      <TwoColumnParrain
        asideFirst
        asideLabel="Ma marraine"
        aside={
          <>
            <Card
              variant="kid"
              padding="xl"
              className="flex flex-col items-center gap-3 text-center"
            >
              <Avatar tone="info-strong" initials="CM" size={96} />
              <p className="m-0 text-15 font-semibold text-muted">Ma marraine</p>
              <p className="m-0 text-26 font-extrabold">Claire</p>
              <p className="m-0 text-15 text-ink-soft">Elle habite à Lyon, en France.</p>
            </Card>
            <Card variant="brand" className="flex flex-col gap-1.5 rounded-20">
              <p className="m-0 text-15 font-semibold text-brand-200">Prochain appel vidéo</p>
              <p className="m-0 text-20 font-extrabold">Samedi 14 novembre</p>
              <p className="m-0 text-15 text-brand-200">à 10 h, chez M. Koffi</p>
            </Card>
          </>
        }
      >
        <Card
          variant="kid"
          padding="none"
          as="section"
          aria-labelledby="conversation"
          className="overflow-hidden"
        >
          <h1
            id="conversation"
            className="m-0 border-b border-kid-line-soft px-6 py-5 text-22 font-extrabold"
          >
            Mes messages avec Claire
          </h1>
          <div className="flex flex-col gap-4 bg-kid-thread p-6">
            <p className="m-0 max-w-[75%] self-start rounded-[18px_18px_18px_4px] bg-info-100 px-4.5 py-3.5 text-18 leading-[1.5] [overflow-wrap:anywhere]">
              Bravo pour ta rentrée Aïcha ! Raconte-moi ta maîtresse ?
            </p>
            <p className="m-0 max-w-[75%] self-end rounded-[18px_18px_4px_18px] bg-brand-100 px-4.5 py-3.5 text-18 leading-[1.5] [overflow-wrap:anywhere]">
              Bonjour tata Claire ! J&apos;ai eu mon bulletin.
            </p>
          </div>
          <form
            className="flex flex-col gap-3.5 border-t border-kid-line-soft px-6 pt-5 pb-6"
            action="/dev/ui/enfant"
          >
            <FormField label="Écris ton message" size="kid">
              <Textarea size="kid" rows={4} placeholder="Bonjour Claire…" />
            </FormField>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 flex items-center gap-2 text-15 text-ink-soft">
                <ShieldIcon size={18} className="text-brand-700" />
                L&apos;association lit ton message avant de l&apos;envoyer à Claire.
              </p>
              <Button type="submit" variant="kid-primary" rightIcon={<SendIcon size={20} />}>
                Envoyer
              </Button>
            </div>
          </form>
        </Card>
      </TwoColumnParrain>
    </KidShell>
  );
}
