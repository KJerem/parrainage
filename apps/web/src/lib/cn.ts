import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doit connaître les échelles de la maquette pour ne pas confondre
// une taille de texte (`text-15`) avec une couleur (`text-ink`).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "11",
        "12",
        "13",
        "14",
        "15",
        "16",
        "17",
        "18",
        "19",
        "20",
        "22",
        "24",
        "26",
        "28",
        "30",
        "32",
        "36",
        "44",
      ],
      radius: ["4", "5", "8", "9", "10", "12", "14", "16", "18", "20", "24", "28", "32"],
      color: [
        "ink",
        "ink-soft",
        "muted",
        "side-ink",
        "ink-800",
        "canvas",
        "surface-alt",
        "line",
        "line-soft",
        "line-strong",
        "brand-900",
        "brand-700",
        "brand-600",
        "brand-400",
        "brand-300",
        "brand-200",
        "brand-100",
        "accent-600",
        "accent-500",
        "accent-100",
        "accent-700",
        "accent-900",
        "danger-600",
        "danger-100",
        "info-600",
        "info-150",
        "info-100",
        "kid-canvas",
        "kid-line",
        "kid-line-soft",
        "kid-thread",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
