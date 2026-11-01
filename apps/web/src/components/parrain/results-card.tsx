import type { ResultPoint, ResultsSummary } from "@parrainage/contracts";
import Link from "next/link";
import { Card, CardTitle, ProgressBar } from "@/components/ui";
import { formatAverage } from "@/lib/format";
import { ofName } from "@/lib/labels";

/** « CM2 · 1er trimestre », « CM1 · moyenne annuelle ». */
export function resultLabel(point: Pick<ResultPoint, "className" | "periodLabel">): string {
  return `${point.className} · ${point.periodLabel}`;
}

function ResultBar({ point, tone }: { point: ResultPoint; tone: "soft" | "brand" }) {
  const average = point.averageX100;
  return (
    <ProgressBar
      label={resultLabel(point)}
      valueLabel={average === null ? "Non communiquée" : formatAverage(average)}
      value={average === null ? 0 : average / 100}
      max={20}
      tone={tone}
    />
  );
}

/** Les deux derniers résultats envoyés (le précédent en vert clair) et l'appréciation. */
export function ResultsCard({
  childId,
  firstName,
  results,
}: {
  childId: string;
  firstName: string;
  results: ResultsSummary;
}) {
  const { previous, current, appreciation } = results;
  return (
    <Card as="section" aria-labelledby="resultats-titre" className="flex flex-col gap-3.5">
      <CardTitle id="resultats-titre">Résultats scolaires</CardTitle>
      {current ? (
        <>
          <div className="flex flex-col gap-3">
            {previous ? <ResultBar point={previous} tone="soft" /> : null}
            <ResultBar point={current} tone="brand" />
          </div>
          {appreciation ? (
            <p className="m-0 text-14 leading-[1.5] text-ink-soft">
              Appréciation : «&nbsp;{appreciation}&nbsp;»
            </p>
          ) : null}
          <Link
            href={`/parrain/filleuls/${encodeURIComponent(childId)}/bulletins`}
            className="self-start text-14 font-semibold underline"
          >
            Voir tous les bulletins
          </Link>
        </>
      ) : (
        <p className="m-0 text-14 leading-[1.5] text-ink-soft">
          Les résultats {ofName(firstName)} s&apos;afficheront ici dès que son relais les aura
          envoyés.
        </p>
      )}
    </Card>
  );
}
