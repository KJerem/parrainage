import type { RelaisChildRow } from "@parrainage/contracts";
import { Notice } from "@/components/ui";

/** Rappel commun : sans consentement, le parrain lit le texte sans voir les médias. */
export function ConsentNotice({ childrenWithout }: { childrenWithout: readonly RelaisChildRow[] }) {
  return (
    <Notice size="sm" title="Sans autorisation pour les photos et vidéos">
      {childrenWithout
        .slice(0, 5)
        .map((child) => child.name)
        .join(", ")}
      {childrenWithout.length > 5 ? ` et ${childrenWithout.length - 5} de plus` : ""} : leurs
      parrains liront le texte, sans les photos ni les vidéos.
    </Notice>
  );
}
