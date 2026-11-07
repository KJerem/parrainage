/* eslint-disable @next/next/no-html-link-for-pages -- liens classiques : hors ligne, une navigation
   dans l'appli échouerait, alors qu'un chargement de page passe par le service worker. */
import type { Metadata } from "next";
import { WifiIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Hors ligne" };

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-10 px-4 text-14 font-semibold no-underline";

// Page statique, précachée par le service worker : aucune donnée ni session, même au premier accès.
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-100 text-accent-700">
        <WifiIcon size={26} />
      </span>
      <h1 className="m-0 text-24 font-extrabold">Vous êtes hors ligne</h1>
      <p className="m-0 max-w-[420px] text-15 leading-[1.5] text-ink-soft">
        Cette page demande du réseau. Hors ligne, vous pouvez toujours ouvrir l&apos;accueil et
        préparer une nouvelle : elle partira au retour du réseau.
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <a href="/relais" className={`${linkClass} border border-line-strong bg-white text-ink`}>
          Accueil
        </a>
        <a href="/relais/publier" className={`${linkClass} bg-accent-500 font-bold text-ink`}>
          Publier une nouvelle
        </a>
      </div>
    </main>
  );
}
