/* eslint-disable @next/next/no-img-element -- médias servis par /api/media (302 vers une URL
   présignée de 120 s) : l'optimiseur de next/image n'a pas la session du visiteur. */
import { cn } from "@/lib/cn";
import { FileIcon, PlayCircleIcon } from "./icons";

const tileHeight = { md: "h-[150px]", lg: "h-[220px]" } as const;

export type MediaTileProps = {
  kind: "photo" | "video" | "document";
  /** Légende : texte de l'emplacement réservé, texte alternatif ou nom accessible du fichier. */
  label: string;
  /** Photo ou vidéo lisible ; absente, la tuile reste un emplacement réservé (maquette). */
  src?: string | null;
  /** Document : lien de téléchargement ; absent, la tuile n'est pas cliquable. */
  href?: string | null;
  /** Vidéo : durée affichée (« Vidéo · 0:42 »). */
  duration?: string | null;
  /** 150 px dans une grille, 220 px pour un média seul (Main.dc.html). */
  size?: keyof typeof tileHeight;
  className?: string;
};

/** Tuile média du fil : photo, vidéo ou document, avec ou sans fichier. */
export function MediaTile({
  kind,
  label,
  src,
  href,
  duration,
  size = "md",
  className,
}: MediaTileProps) {
  const base = cn(
    "flex w-full min-w-0 items-center justify-center overflow-hidden rounded-12 text-13 font-semibold",
    tileHeight[size],
    className,
  );

  if (kind === "photo") {
    return src ? (
      <img
        src={src}
        alt={label}
        loading="lazy"
        decoding="async"
        className={cn(base, "bg-brand-100 object-cover")}
      />
    ) : (
      <div className={cn(base, "bg-brand-100 px-3 text-center text-brand-700")}>{label}</div>
    );
  }

  if (kind === "video") {
    return src ? (
      <video
        src={src}
        controls
        preload="none"
        aria-label={label}
        className={cn(base, "bg-brand-700 object-cover")}
      />
    ) : (
      <div className={cn(base, "gap-2.5 bg-brand-700 px-3 text-14 text-white")}>
        <PlayCircleIcon size={28} />
        {duration ? `Vidéo · ${duration}` : "Vidéo"}
      </div>
    );
  }

  const documentClasses = cn(
    base,
    "flex-col gap-1.5 border border-dashed border-line-strong bg-canvas px-3 text-center text-ink-soft",
  );
  const content = (
    <>
      <FileIcon size={24} />
      <span className="max-w-full text-balance break-words">{label}</span>
    </>
  );
  return href ? (
    <a
      href={href}
      className={cn(
        documentClasses,
        "no-underline transition-colors hover:bg-line-soft hover:text-ink",
      )}
    >
      {content}
      <span className="sr-only">{" (télécharger)"}</span>
    </a>
  ) : (
    <div className={documentClasses}>{content}</div>
  );
}
