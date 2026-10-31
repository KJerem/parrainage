import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  strokeWidth?: number;
};

export type IconComponent = (props: IconProps) => ReactNode;

// Tracés copiés de la maquette (viewBox 24, trait arrondi, couleur héritée).
function createIcon(
  displayName: string,
  paths: ReactNode,
  defaults: { strokeWidth?: number; className?: string } = {},
): IconComponent {
  function Icon({ size = 24, strokeWidth, className, ...props }: IconProps) {
    const labelled = props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth ?? defaults.strokeWidth ?? 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={labelled ? undefined : true}
        role={labelled ? "img" : undefined}
        className={cn("shrink-0", defaults.className, className)}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const MessageIcon = createIcon(
  "MessageIcon",
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
);

export const VideoIcon = createIcon(
  "VideoIcon",
  <>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="m16 10 6-3v10l-6-3z" />
  </>,
);

export const PlayCircleIcon = createIcon(
  "PlayCircleIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m10 8 6 4-6 4z" />
  </>,
);

export const CameraIcon = createIcon(
  "CameraIcon",
  <>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
    <circle cx="12" cy="13" r="3" />
  </>,
);

export const ImageIcon = createIcon(
  "ImageIcon",
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3-3-9 9" />
  </>,
);

export const MicIcon = createIcon(
  "MicIcon",
  <>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <path d="M12 18v4" />
  </>,
);

export const FileIcon = createIcon(
  "FileIcon",
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </>,
);

// « Saisir des résultats » (Relais).
export const FileLineIcon = createIcon(
  "FileLineIcon",
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 15h6" />
  </>,
);

// « Envoyer mon bulletin » (Enfant).
export const FileLinesIcon = createIcon(
  "FileLinesIcon",
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 15h6" />
    <path d="M9 11h2" />
  </>,
);

export const BellIcon = createIcon(
  "BellIcon",
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
);

export const WifiIcon = createIcon(
  "WifiIcon",
  <>
    <path d="M12 20h.01" />
    <path d="M8.5 16.4a5 5 0 0 1 7 0" />
    <path d="M2 8.8a15 15 0 0 1 20 0" />
  </>,
);

export const LockIcon = createIcon(
  "LockIcon",
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>,
);

export const ShieldIcon = createIcon(
  "ShieldIcon",
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
);

export const HomeIcon = createIcon(
  "HomeIcon",
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
);

export const UserIcon = createIcon(
  "UserIcon",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);

export const UsersIcon = createIcon(
  "UsersIcon",
  <>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
  </>,
);

export const UserPlusIcon = createIcon(
  "UserPlusIcon",
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6" />
    <path d="M22 11h-6" />
  </>,
);

export const SendIcon = createIcon(
  "SendIcon",
  <>
    <path d="m22 2-7 20-4-9-9-4z" />
    <path d="M22 2 11 13" />
  </>,
  { strokeWidth: 2.4 },
);

export const CheckIcon = createIcon("CheckIcon", <path d="M20 6 9 17l-5-5" />, {
  strokeWidth: 2.4,
});

export const ChevronRightIcon = createIcon("ChevronRightIcon", <path d="m9 18 6-6-6-6" />);

export const ChevronLeftIcon = createIcon("ChevronLeftIcon", <path d="m15 18-6-6 6-6" />);

// La maquette écrit ces quatre-là en caractères (×, +, ←, →) : même style de trait.
export const CloseIcon = createIcon("CloseIcon", <path d="M18 6 6 18M6 6l12 12" />);

export const PlusIcon = createIcon("PlusIcon", <path d="M12 5v14M5 12h14" />);

export const ArrowLeftIcon = createIcon("ArrowLeftIcon", <path d="M19 12H5m7 7-7-7 7-7" />);

export const ArrowRightIcon = createIcon("ArrowRightIcon", <path d="M5 12h14m-7-7 7 7-7 7" />);

export const MenuIcon = createIcon("MenuIcon", <path d="M4 6h16M4 12h16M4 18h16" />);

/* Images du code secret de l'enfant, avec leur couleur propre. */

export const SunIcon = createIcon(
  "SunIcon",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
  { className: "text-accent-700" },
);

export const TreeIcon = createIcon(
  "TreeIcon",
  <>
    <path d="M12 22v-7" />
    <path d="M7 15h10l-5-11z" />
  </>,
  { className: "text-brand-700" },
);

export const FishIcon = createIcon(
  "FishIcon",
  <>
    <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
    <path d="M22 12l-4 0" />
  </>,
  { className: "text-info-600" },
);

export const HeartIcon = createIcon(
  "HeartIcon",
  <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  { className: "text-danger-600" },
);

export const HouseIcon = createIcon(
  "HouseIcon",
  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  { className: "text-ink-soft" },
);

export const StarIcon = createIcon(
  "StarIcon",
  <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />,
  { className: "text-accent-700" },
);

export const imageCodes = ["sun", "tree", "fish", "heart", "house", "star"] as const;

export type ImageCode = (typeof imageCodes)[number];

export const imageCodeIcons: Record<ImageCode, { label: string; Icon: IconComponent }> = {
  sun: { label: "Soleil", Icon: SunIcon },
  tree: { label: "Arbre", Icon: TreeIcon },
  fish: { label: "Poisson", Icon: FishIcon },
  heart: { label: "Cœur", Icon: HeartIcon },
  house: { label: "Maison", Icon: HouseIcon },
  star: { label: "Étoile", Icon: StarIcon },
};
