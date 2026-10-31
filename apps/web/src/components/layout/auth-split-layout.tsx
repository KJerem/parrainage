import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { MAIN_ID, SkipLink } from "./skip-link";

export type AuthSplitLayoutProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Texte du gabarit photo (masqué sous 960 px). */
  photoLabel?: ReactNode;
  children: ReactNode;
};

/**
 * Connexion (P-Connexion.dc.html) : colonne verte et colonne du formulaire côte à côte à
 * partir de 960 px (chacune `flex: 1 1 480px`) ; en dessous, colonne verte compacte au-dessus.
 */
export function AuthSplitLayout({
  title = "Suivez la scolarité de votre filleul, de près.",
  description = "Nouvelles du relais, bulletins, messages et appels vidéo : tout le lien avec votre filleul au même endroit.",
  photoLabel = "Photo : enfants en classe",
  children,
}: AuthSplitLayoutProps) {
  return (
    <div className="flex flex-1 flex-col min-[960px]:flex-row">
      <SkipLink />
      <header className="flex flex-col justify-between gap-6 bg-brand-700 p-6 text-white min-[960px]:flex-[1_1_480px] min-[960px]:gap-10 min-[960px]:p-14">
        <div className="flex items-center gap-3">
          <Logo size={44} tone="accent" />
          <span className="text-20 font-bold">Parrainage</span>
        </div>
        <div className="flex max-w-[480px] flex-col gap-4">
          <h1 className="m-0 text-28 leading-[1.1] font-extrabold min-[960px]:text-44">{title}</h1>
          <p className="m-0 text-18 leading-[1.5] text-brand-200">{description}</p>
        </div>
        {/* Gabarit décoratif ; texte blanc car #CFE3DC sur #2B6F60 reste sous 4,5:1. */}
        <div
          aria-hidden="true"
          className="hidden h-[220px] items-center justify-center rounded-20 bg-brand-600 px-4 text-center text-14 font-semibold text-white min-[960px]:flex"
        >
          {photoLabel}
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="flex flex-1 items-center justify-center p-6 focus:outline-none min-[960px]:flex-[1_1_480px] min-[960px]:p-14"
      >
        <div className="w-full max-w-form">{children}</div>
      </main>
    </div>
  );
}
