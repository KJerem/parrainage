import { type ChildCode, type ChildCodeImage, childCodeImageLabels } from "@parrainage/contracts";
import type { ComponentType } from "react";
import { FishIcon, HeartIcon, HouseIcon, StarIcon, SunIcon, TreeIcon } from "@/components/ui";
import { cn } from "@/lib/cn";

export const childCodeIcons: Readonly<Record<ChildCodeImage, ComponentType<{ size?: number }>>> = {
  SOLEIL: SunIcon,
  ARBRE: TreeIcon,
  POISSON: FishIcon,
  MAISON: HouseIcon,
  ETOILE: StarIcon,
  COEUR: HeartIcon,
};

const tones = ["bg-accent-100", "bg-brand-100", "bg-info-100"] as const;

/** Les 3 images du code, dans l'ordre où l'enfant les choisira. */
export function ChildCodeImages({ code, size = "md" }: { code: ChildCode; size?: "md" | "lg" }) {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-3 p-0" aria-label="Code image, dans l'ordre">
      {code.map((image, index) => {
        const Icon = childCodeIcons[image];
        return (
          <li
            key={image}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-12 px-2 font-bold",
              tones[index % tones.length],
              size === "lg" ? "size-24 text-15" : "min-h-12 min-w-16 py-1.5 text-13",
            )}
          >
            <Icon size={size === "lg" ? 36 : 18} />
            {childCodeImageLabels[image]}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Carte à imprimer pour l'enfant : son code ne s'affiche qu'à ce moment-là (il n'est conservé que
 * haché). À l'impression, seule cette carte sort sur le papier (globals.css).
 */
export function ChildCodeCard({ name, code }: { name: string; code: ChildCode }) {
  return (
    <div className="carte-code flex flex-col items-start gap-4 rounded-16 border border-line bg-white p-6">
      <div>
        <h2 className="m-0 text-20 font-bold">Carte de {name}</h2>
        <p className="m-0 text-14 text-ink-soft">
          Pour se connecter, l&apos;enfant choisit sa photo, puis ces images dans cet ordre.
        </p>
      </div>
      <ChildCodeImages code={code} size="lg" />
      <p className="m-0 text-13 text-muted">
        Gardez cette carte en lieu sûr : le code ne sera plus affiché. Il pourra être remplacé
        depuis la fiche de l&apos;enfant.
      </p>
    </div>
  );
}
