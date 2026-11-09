import { initials, mediaPath } from "@parrainage/contracts";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fileStatusLabels } from "@/components/bureau/bureau-labels";
import { ValidateFileButton } from "@/components/bureau/validate-file-button";
import { BackLink } from "@/components/parrain/back-link";
import { Avatar, Button, Card, CardTitle, Chip } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getBureauChild } from "@/lib/bureau.server";
import { formatAge, formatDaysAgo, formatEuros, formatLongDate } from "@/lib/format";
import { ofName } from "@/lib/labels";

type Props = PageProps<"/bureau/enfants/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const child = await getBureauChild((await params).id);
  return { title: `Dossier ${ofName(`${child.firstName} ${child.lastInitial}.`)}` };
}

function Rows({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="m-0 flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
          <dt className="text-14 font-semibold text-muted sm:w-44 sm:shrink-0">{row.label}</dt>
          <dd className="m-0 min-w-0 text-15 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const yesNo = (value: boolean) => (value ? "Oui" : "Non");

// Dossier d'un enfant vu par le bureau (lien de l'e-mail « dossier à vérifier ») : vérification,
// validation, binôme. Le téléphone du responsable n'est jamais transmis aux parrains.
export default async function BureauChildPage({ params }: Props) {
  await requireRole("bureau");
  const child = await getBureauChild((await params).id);
  const name = `${child.firstName} ${child.lastInitial}.`;
  const status = fileStatusLabels[child.fileStatus];
  const photo = child.photo ? mediaPath(child.photo) : null;
  const consentDocument = child.consentDocument ? mediaPath(child.consentDocument) : null;
  const born = child.gender === "F" ? "Née le" : "Né le";
  return (
    <>
      <BackLink href="/bureau/binomes">Retour aux binômes</BackLink>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          size={56}
          tone={child.avatarTone}
          initials={initials(name)}
          {...(photo ? { src: photo, alt: "" } : {})}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Dossier {ofName(name)}</h1>
          <p className="m-0 text-15 text-muted">
            {child.className} · {child.relais.displayName}, {child.relais.city}
          </p>
        </div>
        <Chip variant={status.variant} size="md">
          {status.label}
        </Chip>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card as="section" aria-labelledby="identite" className="flex flex-col gap-4">
          <CardTitle id="identite">Identité</CardTitle>
          <Rows
            rows={[
              {
                label: born,
                value: `${formatLongDate(child.birthDate, "UTC")} (${formatAge(child.age)})`,
              },
              { label: "Classe", value: `${child.className} · année ${child.schoolYear}` },
              { label: "École", value: child.schoolName ?? "Non renseignée" },
              { label: "Quartier", value: child.district },
              { label: "Ajouté par", value: child.addedBy },
            ]}
          />
        </Card>

        <Card as="section" aria-labelledby="responsable" className="flex flex-col gap-4">
          <CardTitle id="responsable">Responsable légal</CardTitle>
          <Rows
            rows={[
              { label: "Nom", value: child.guardianName },
              { label: "Téléphone", value: child.guardianPhone },
            ]}
          />
          <p className="m-0 text-13 text-muted">Jamais transmis aux parrains.</p>
        </Card>

        <Card as="section" aria-labelledby="consentements" className="flex flex-col gap-4">
          <CardTitle id="consentements">Consentements</CardTitle>
          <Rows
            rows={[
              { label: "Parrainage", value: yesNo(child.consentSponsorship) },
              { label: "Photos et vidéos", value: yesNo(child.consentMedia) },
              {
                label: "Autorisation signée",
                value: consentDocument ? (
                  <a href={consentDocument} target="_blank" rel="noopener">
                    Voir l&apos;autorisation
                  </a>
                ) : (
                  "Aucun document"
                ),
              },
            ]}
          />
        </Card>

        <Card as="section" aria-labelledby="suivi" className="flex flex-col gap-4">
          <CardTitle id="suivi">Dossier et parrainage</CardTitle>
          <Rows
            rows={[
              {
                label: "Envoyé le",
                value: child.submittedAt ? formatLongDate(child.submittedAt) : "—",
              },
              {
                label: "Validé le",
                value: child.validatedAt ? formatLongDate(child.validatedAt) : "Pas encore",
              },
              {
                label: "Dernière nouvelle",
                value: child.lastNewsAt
                  ? formatDaysAgo(child.lastNewsAt, child.now)
                  : "Aucune pour l'instant",
              },
              {
                label: child.sponsorships.length > 1 ? "Parrains" : "Parrain",
                value:
                  child.sponsorships.length === 0
                    ? "En attente d'un parrain"
                    : child.sponsorships
                        .map(
                          (s) =>
                            `${s.parrain.displayName} (depuis le ${formatLongDate(s.startDate, "UTC")}, ${formatEuros(s.monthlyAmountCents)} par mois)`,
                        )
                        .join(" ; "),
              },
            ]}
          />
          <div className="flex flex-wrap gap-2.5">
            {child.fileStatus === "SUBMITTED" ? (
              <ValidateFileButton childId={child.id} relaisName={child.relais.displayName} />
            ) : null}
            {child.sponsorships.length === 0 && child.fileStatus !== "ARCHIVED" ? (
              <Button
                href={`/bureau/binomes?enfant=${encodeURIComponent(child.id)}`}
                variant={child.fileStatus === "SUBMITTED" ? "secondary" : "primary"}
              >
                Choisir un parrain
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
