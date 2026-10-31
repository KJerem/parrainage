import type { Metadata } from "next";
import { AppSidebarShell } from "@/components/layout";
import { Button, Card, Chip, FilterPills, StatTile } from "@/components/ui";

export const metadata: Metadata = { title: "Coquille bureau" };

const file = [
  ["Aïcha S. → Claire M.", "Texte + bulletin T1", "success", "Aucune", "il y a 2 h"],
  ["Paul D. → Kofi A.", "Texte", "danger", "Coordonnées personnelles", "il y a 5 h"],
  ["Mariam T. → Hélène R.", "Vidéo 0:35", "warning", "Visage d'un autre enfant", "hier"],
] as const;

export default function BureauDemoPage() {
  return (
    <AppSidebarShell
      tone="bureau"
      active="vue-ensemble"
      identity="Bureau · trésorerie"
      counts={{ moderation: 12 }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 mb-1 text-15 text-muted">Octobre 2026</p>
          <h1 className="m-0 text-30 font-extrabold">Vue d&apos;ensemble</h1>
        </div>
        <Button variant="secondary">Exporter le rapport</Button>
      </div>
      <section
        aria-label="Indicateurs"
        className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
      >
        <StatTile size="lg" label="Binômes actifs" value="42" sub="dans 3 pays · 3 relais" />
        <StatTile
          size="lg"
          label="Messages à relire"
          value="12"
          tone="warning"
          sub="dont 3 contenant des photos"
        />
        <StatTile
          size="lg"
          label="Sans nouvelle > 60 j"
          value="5"
          tone="danger"
          sub="enfants, relais prévenus"
        />
      </section>
      <Card as="section" padding="none" aria-labelledby="moderation-titre">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4.5">
          <h2 id="moderation-titre" className="m-0 text-18 font-bold">
            File de modération
          </h2>
          <FilterPills
            aria-label="Filtrer la file"
            defaultValue="tous"
            options={[
              { value: "tous", label: "Tous" },
              { value: "enfant", label: "Enfant → parrain" },
              { value: "parrain", label: "Parrain → enfant" },
              { value: "signales", label: "Signalés" },
            ]}
          />
        </div>
        <div className="overflow-x-auto" role="region" aria-label="File de modération" tabIndex={0}>
          <table className="w-full min-w-[760px] border-collapse text-14">
            <thead>
              <tr className="text-left text-13 text-muted">
                <th scope="col" className="px-5 py-3 font-semibold">
                  De → À
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Contenu
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Alerte
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Reçu
                </th>
              </tr>
            </thead>
            <tbody>
              {file.map(([qui, contenu, ton, alerte, recu]) => (
                <tr key={qui} className="border-t border-line-soft">
                  <td className="px-5 py-3.5 font-semibold">{qui}</td>
                  <td className="px-2 py-3.5 text-ink-soft">{contenu}</td>
                  <td className="px-2 py-3.5">
                    <Chip variant={ton}>{alerte}</Chip>
                  </td>
                  <td className="px-2 py-3.5 text-muted">{recu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppSidebarShell>
  );
}
