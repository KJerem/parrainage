import { mediaPath, type MediaKind, type MediaRef } from "@parrainage/contracts";
import { MediaTile, type MediaTileProps } from "@/components/ui/media-tile";
import { formatDuration } from "@/lib/format";
import { mediaKindLabels } from "@/lib/labels";

function tileKind(kind: MediaKind): MediaTileProps["kind"] {
  if (kind === "VIDEO") return "video";
  if (kind === "PHOTO" || kind === "AVATAR") return "photo";
  return "document";
}

/**
 * Tuile d'un média de l'API : READY → fichier lu via /api/media/:id (le document se
 * télécharge), PLACEHOLDER → emplacement réservé légendé, comme la maquette.
 */
export function MediaRefTile({ media, size }: { media: MediaRef; size?: MediaTileProps["size"] }) {
  const kind = tileKind(media.kind);
  return (
    <MediaTile
      kind={kind}
      size={size}
      label={media.label ?? mediaKindLabels[media.kind]}
      src={kind === "document" ? null : mediaPath(media)}
      href={kind === "document" ? mediaPath(media, { download: true }) : null}
      duration={media.durationSec === null ? null : formatDuration(media.durationSec)}
    />
  );
}

/**
 * Médias d'une carte du fil : grille de 2 colonnes (150 px). `feature` : un média seul occupe
 * toute la largeur sur 220 px (vidéo de la nouvelle de rentrée).
 */
export function MediaGallery({
  media,
  layout = "grid",
}: {
  media: readonly MediaRef[];
  layout?: "grid" | "feature";
}) {
  const [first] = media;
  if (!first) {
    return null;
  }
  if (layout === "feature" && media.length === 1) {
    return <MediaRefTile media={first} size="lg" />;
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {media.map((item) => (
        <MediaRefTile key={item.id} media={item} />
      ))}
    </div>
  );
}
