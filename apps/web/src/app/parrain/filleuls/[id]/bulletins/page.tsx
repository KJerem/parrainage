import { mediaPath, type Bulletin, type MediaRef } from "@parrainage/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/parrain/back-link";
import { filleulHref } from "@/components/parrain/filleul-switcher";
import { resultLabel } from "@/components/parrain/results-card";
import { buttonVariants, Card, EmptyState, FileIcon, FileLinesIcon } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { cn } from "@/lib/cn";
import { formatAverage, formatLongDate, formatRank } from "@/lib/format";
import { mediaKindLabels, ofName } from "@/lib/labels";
import { findFilleul, getBulletins, NOT_FOUND_TITLE } from "@/lib/parrain.server";

export async function generateMetadata({
  params,
}: PageProps<"/parrain/filleuls/[id]/bulletins">): Promise<Metadata> {
  const filleul = await findFilleul((await params).id);
  return { title: filleul ? `Bulletins ${ofName(filleul.firstName)}` : NOT_FOUND_TITLE };
}

/** Fichier d'un bulletin : téléchargement s'il existe, sinon emplacement réservé. */
function BulletinFile({ media }: { media: MediaRef }) {
  const label = media.label ?? mediaKindLabels[media.kind];
  const href = mediaPath(media, { download: true });
  // Lien simple, pas next/link : un téléchargement de l'API ne se précharge pas.
  return href ? (
    <a href={href} className={cn(buttonVariants({ variant: "secondary" }))}>
      <FileIcon size={18} />
      Télécharger le bulletin
      <span className="sr-only"> : {label}</span>
    </a>
  ) : (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-10 border border-dashed border-line-strong bg-canvas px-4 text-14 text-ink-soft">
      <FileIcon size={18} />
      <span>
        <strong className="font-semibold">{label}</strong> · aperçu non disponible
      </span>
    </span>
  );
}

function BulletinCard({ bulletin }: { bulletin: Bulletin }) {
  const titleId = `bulletin-${bulletin.id}`;
  const tiles = [
    {
      label: "Moyenne",
      value: bulletin.averageX100 === null ? null : formatAverage(bulletin.averageX100),
    },
    {
      label: "Rang",
      value: bulletin.rank === null ? null : formatRank(bulletin.rank, bulletin.classSize),
    },
  ].filter((tile): tile is { label: string; value: string } => tile.value !== null);
  return (
    <Card as="article" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div>
        <h2 id={titleId} className="m-0 text-18 font-bold">
          {resultLabel(bulletin)}
        </h2>
        <p className="m-0 mt-0.5 text-13 text-muted">
          Année scolaire {bulletin.schoolYear}
          {bulletin.sentAt ? (
            <>
              {" · envoyé le "}
              <time dateTime={bulletin.sentAt}>{formatLongDate(bulletin.sentAt)}</time>
            </>
          ) : null}
        </p>
      </div>
      {tiles.length > 0 ? (
        <dl className="m-0 grid max-w-[420px] grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="min-w-0 rounded-12 bg-canvas p-3">
              <dt className="text-13 text-muted">{tile.label}</dt>
              <dd className="m-0 text-20 font-extrabold">{tile.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {bulletin.appreciation ? (
        <p className="m-0 text-14 leading-[1.5] text-ink-soft">
          Appréciation : «&nbsp;{bulletin.appreciation}&nbsp;»
        </p>
      ) : null}
      {bulletin.media.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
          {bulletin.media.map((media) => (
            <li key={media.id} className="max-w-full">
              <BulletinFile media={media} />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/** Résultats envoyés aux parrains, du plus récent au plus ancien, avec leurs bulletins. */
export default async function BulletinsPage({
  params,
}: PageProps<"/parrain/filleuls/[id]/bulletins">) {
  await requireRole("parrain");
  const { id } = await params;
  // L'API vérifie le binôme (404 sinon) ; la liste donne le prénom affiché.
  const [filleul, { items }] = await Promise.all([findFilleul(id), getBulletins(id)]);
  if (!filleul) {
    notFound();
  }

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={filleulHref("/parrain", id)}>Retour à {filleul.firstName}</BackLink>
        <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">
          Bulletins {ofName(filleul.firstName)}
        </h1>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-col gap-4">
          {items.map((bulletin) => (
            <BulletinCard key={bulletin.id} bulletin={bulletin} />
          ))}
        </div>
      ) : (
        <Card padding="none">
          <EmptyState
            icon={<FileLinesIcon size={26} />}
            title="Aucun bulletin pour le moment"
            description={`Les bulletins ${ofName(filleul.firstName)} apparaîtront ici dès que son relais les aura envoyés.`}
          />
        </Card>
      )}
    </div>
  );
}
