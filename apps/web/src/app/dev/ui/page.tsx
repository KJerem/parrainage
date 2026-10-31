import type { Metadata } from "next";
import Link from "next/link";
import { devRoutes } from "./routes";

export const metadata: Metadata = {
  title: "Guide de style",
};

export default function DevUiIndexPage() {
  const sections = devRoutes.filter((route) => route.path !== "/dev/ui");

  return (
    <main className="mx-auto flex w-full max-w-parrain flex-1 flex-col gap-6 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-28 leading-[1.1] font-extrabold">Guide de style</h1>
        <p className="m-0 text-15 leading-[1.5] text-ink-soft">
          Les composants de la plateforme, ajoutés au fil des phases.
        </p>
      </header>
      {sections.length > 0 ? (
        <nav aria-label="Sections du guide de style">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {sections.map((section) => (
              <li key={section.path}>
                <Link
                  href={section.path}
                  className="flex min-h-10 items-center rounded-10 border border-line bg-white px-4 text-15 font-semibold no-underline pointer-coarse:min-h-11"
                >
                  {section.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <p className="m-0 rounded-12 border border-dashed border-line-strong bg-white px-4 py-6 text-15 text-muted">
          Aucune section pour l’instant.
        </p>
      )}
    </main>
  );
}
