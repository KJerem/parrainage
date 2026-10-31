import type { Metadata } from "next";
import { ParrainShell, TwoColumnParrain } from "@/components/layout";
import {
  Avatar,
  Button,
  Card,
  CardTitle,
  Chip,
  MessageIcon,
  PhotoSquare,
  ProgressBar,
  VideoIcon,
} from "@/components/ui";

export const metadata: Metadata = { title: "Coquille parrain" };

export default function ParrainDemoPage() {
  return (
    <ParrainShell active="filleuls" user={{ initials: "CM", name: "Claire M." }} unreadMessages={2}>
      <div>
        <p className="m-0 mb-1 text-15 text-muted">Bonjour Claire</p>
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">Vos filleuls</h1>
      </div>
      <TwoColumnParrain
        asideLabel="Suivi"
        aside={
          <>
            <Card variant="brand" as="section" className="flex flex-col gap-2.5">
              <h2 className="m-0 text-14 font-semibold text-brand-200">Prochain appel vidéo</h2>
              <p className="m-0 text-22 font-extrabold">Samedi 14 novembre · 11 h</p>
              <p className="m-0 text-14 text-brand-200">Depuis la salle du relais, avec M. Koffi</p>
              <Button variant="accent">Ajouter à mon agenda</Button>
            </Card>
            <Card as="section" className="flex flex-col gap-3.5">
              <CardTitle as="h2">Résultats scolaires</CardTitle>
              <ProgressBar
                label="CM1 · moyenne annuelle"
                valueLabel="11,8 / 20"
                value={11.8}
                max={20}
                tone="soft"
              />
              <ProgressBar
                label="CM2 · 1er trimestre"
                valueLabel="13,4 / 20"
                value={13.4}
                max={20}
              />
            </Card>
          </>
        }
      >
        <Card
          as="section"
          padding="xl"
          aria-label="Profil du filleul"
          className="flex flex-wrap items-center gap-6"
        >
          <PhotoSquare label="Photo d'Aïcha" />
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="m-0 text-26 font-extrabold">Aïcha S.</h2>
              <Chip variant="success" size="md">
                Parrainée depuis mars 2023
              </Chip>
            </div>
            <p className="m-0 flex flex-wrap gap-x-6 gap-y-2 text-15 text-ink-soft">
              <span>12 ans · CM2</span>
              <span>École primaire publique de Bè, Lomé (Togo)</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              <Button href="/dev/ui/parrain" leftIcon={<MessageIcon size={18} />}>
                Écrire à Aïcha
              </Button>
              <Button href="/dev/ui/parrain" variant="secondary" leftIcon={<VideoIcon size={18} />}>
                Demander un appel vidéo
              </Button>
            </div>
          </div>
        </Card>
        <Card as="article" className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <Avatar tone="amber" initials="AS" size={40} />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-15 font-bold">Aïcha vous a écrit</p>
              <p className="m-0 text-13 text-muted">Hier · envoyé depuis l&apos;école</p>
            </div>
            <Chip variant="info">Bulletin joint</Chip>
          </div>
          <p className="m-0 text-16 leading-[1.55]">
            Bonjour tata Claire ! J&apos;ai eu mon bulletin du premier trimestre. J&apos;ai
            progressé en calcul grâce aux cours du soir.
          </p>
        </Card>
      </TwoColumnParrain>
    </ParrainShell>
  );
}
