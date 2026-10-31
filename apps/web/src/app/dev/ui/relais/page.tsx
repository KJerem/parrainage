import type { Metadata } from "next";
import Link from "next/link";
import { RelaisMobileHeader, RelaisResponsiveShell, TwoColumnWide } from "@/components/layout";
import { Button, Card, CardTitle, Chip, Notice, StatTile } from "@/components/ui";

export const metadata: Metadata = { title: "Coquille relais" };

const enfants = [
  ["Aïcha S. · 12 ans", "CM2 · EPP Bè", "Claire M.", "success", "il y a 2 j"],
  ["Kofi A. · 10 ans", "CE2 · EPP Bè", "Claire M.", "danger", "64 jours"],
  ["Esther N. · 8 ans", "CE1 · EPP Bè", "En attente", "info", "Nouveau dossier"],
  ["Yao D. · 14 ans", "5e · CEG Bè", "Marc P.", "warning", "35 jours"],
] as const;

export default function RelaisDemoPage() {
  return (
    <RelaisResponsiveShell
      active="accueil"
      identity="M. Koffi · Lomé, Bè"
      counts={{ messages: 4 }}
      mobileHeader={
        <RelaisMobileHeader
          subtitle="Relais · Lomé, quartier Bè"
          title="Bonjour M. Koffi"
          unreadNotifications={2}
          banner={
            <Notice variant="offline-dark" size="sm">
              Hors ligne · 2 publications seront envoyées au retour du réseau
            </Notice>
          }
        />
      }
    >
      <div className="hidden flex-wrap items-end justify-between gap-3 md:flex">
        <div>
          <p className="m-0 mb-1 text-15 text-muted">Samedi 31 octobre</p>
          <h1 className="m-0 text-30 font-extrabold">Bonjour M. Koffi</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button href="/dev/ui/relais" variant="secondary">
            Ajouter un enfant
          </Button>
          <Button href="/dev/ui/relais" variant="accent">
            Publier une nouvelle
          </Button>
        </div>
      </div>
      <section
        aria-label="Indicateurs"
        className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5"
      >
        <StatTile size="sm" label="Enfants suivis" value="18" />
        <StatTile size="sm" label="Nouvelles ce mois" value="11" />
        <StatTile size="sm" label="Messages non lus" value="4" tone="warning" />
        <StatTile size="sm" label="Bulletins à saisir" value="7" tone="danger" />
      </section>
      <TwoColumnWide
        asideLabel="À faire"
        aside={
          <Card as="section" padding="md" className="flex flex-col gap-2.5">
            <CardTitle as="h2">À faire</CardTitle>
            <Link
              href="/dev/ui/relais"
              className="flex flex-col rounded-10 bg-accent-100 p-3 text-ink no-underline hover:text-ink"
            >
              <strong className="text-14">Saisir 7 bulletins du T1</strong>
              <span className="text-13 text-accent-900">Avant le 15 novembre</span>
            </Link>
          </Card>
        }
      >
        <Card
          as="section"
          padding="none"
          aria-labelledby="enfants-titre"
          className="overflow-hidden"
        >
          <h2 id="enfants-titre" className="m-0 px-3.5 pt-4 pb-2 text-18 font-bold">
            Mes enfants
          </h2>
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Tableau des enfants"
            tabIndex={0}
          >
            <table className="w-full min-w-[700px] border-collapse text-14">
              <thead>
                <tr className="text-left text-13 text-muted">
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Enfant
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Classe · école
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Parrain
                  </th>
                  <th scope="col" className="px-3.5 py-3 font-semibold">
                    Dernière nouvelle
                  </th>
                </tr>
              </thead>
              <tbody>
                {enfants.map(([nom, classe, parrain, ton, nouvelle]) => (
                  <tr key={nom} className="border-t border-line-soft">
                    <td className="px-3.5 py-3 font-semibold">{nom}</td>
                    <td className="px-3.5 py-3">{classe}</td>
                    <td className="px-3.5 py-3">{parrain}</td>
                    <td className="px-3.5 py-3">
                      <Chip variant={ton}>{nouvelle}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </TwoColumnWide>
    </RelaisResponsiveShell>
  );
}
