import { initials, mediaPath, type FilleulProfile } from "@parrainage/contracts";
import { Avatar, Button, Card, Chip, MessageIcon, PhotoSquare, VideoIcon } from "@/components/ui";
import { features } from "@/lib/features";
import { formatAge } from "@/lib/format";
import { followedByLabel, ofName, sponsoredSinceLabel } from "@/lib/labels";

/** Photo de 120 px : fichier, emplacement réservé (« Photo d'Aïcha »), ou initiales sans photo. */
function ChildPhoto({ child }: { child: FilleulProfile }) {
  const { photo } = child;
  const src = photo ? mediaPath(photo) : null;
  if (src) {
    return <PhotoSquare src={src} alt={`Photo ${ofName(child.firstName)}`} />;
  }
  if (photo) {
    return (
      <PhotoSquare
        label={
          <>
            Photo
            <br />
            {ofName(child.firstName)}
          </>
        }
      />
    );
  }
  return (
    <Avatar
      size={96}
      tone={child.avatarTone}
      initials={initials(`${child.firstName} ${child.lastInitial}`)}
      className="size-30 rounded-16"
    />
  );
}

/** Carte de profil du filleul (Main.dc.html), accords selon le genre. */
export function FilleulProfileCard({
  child,
  conversationId,
}: {
  child: FilleulProfile;
  conversationId: string | null;
}) {
  const place = [child.schoolFullName, `${child.city} (${child.country})`]
    .filter(Boolean)
    .join(", ");
  const writeHref =
    features.messaging && conversationId
      ? `/parrain/messages/${encodeURIComponent(conversationId)}`
      : null;
  return (
    <Card
      as="section"
      padding="xl"
      aria-label={`Profil ${ofName(child.firstName)}`}
      className="flex flex-wrap items-center gap-6"
    >
      <ChildPhoto child={child} />
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-26 font-extrabold">
            {child.firstName} {child.lastInitial}.
          </h2>
          <Chip variant="success" size="md">
            {sponsoredSinceLabel(child.gender, child.sponsoredSince)}
          </Chip>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-15 text-ink-soft">
          <li>
            {formatAge(child.age)} · {child.className}
          </li>
          <li>{place}</li>
          <li>
            {followedByLabel(child.gender)}{" "}
            <strong className="text-ink">{child.relaisDisplayName}</strong>, relais
          </li>
        </ul>
        {writeHref || features.calls ? (
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            {writeHref ? (
              <Button
                href={writeHref}
                leftIcon={<MessageIcon size={18} />}
                className="px-4.5 text-15"
              >
                Écrire à {child.firstName}
              </Button>
            ) : null}
            {features.calls ? (
              <Button
                href={`/parrain/appels?filleul=${encodeURIComponent(child.id)}`}
                variant="secondary"
                leftIcon={<VideoIcon size={18} />}
                className="px-4.5 text-15"
              >
                Demander un appel vidéo
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
