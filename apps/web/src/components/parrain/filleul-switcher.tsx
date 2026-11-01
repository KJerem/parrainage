import { initials, type FilleulList } from "@parrainage/contracts";
import { ChildSwitcher } from "@/components/ui";

/** `/parrain?filleul=…` : l'adresse d'une page pour un filleul donné. */
export function filleulHref(basePath: string, childId: string): string {
  return `${basePath}?${new URLSearchParams({ filleul: childId })}`;
}

/** Sélecteur des filleuls du parrain, affiché à partir de deux filleuls. */
export function FilleulSwitcher({
  filleuls,
  currentId,
  basePath,
}: {
  filleuls: FilleulList;
  currentId: string;
  /** Page cible des liens : l'écran principal ou « Tout le fil ». */
  basePath: string;
}) {
  if (filleuls.length < 2) {
    return null;
  }
  return (
    <ChildSwitcher
      currentId={currentId}
      items={filleuls.map((filleul) => ({
        id: filleul.childId,
        label: filleul.firstName,
        initials: initials(`${filleul.firstName} ${filleul.lastInitial}`),
        tone: filleul.avatarTone,
        href: filleulHref(basePath, filleul.childId),
      }))}
    />
  );
}
