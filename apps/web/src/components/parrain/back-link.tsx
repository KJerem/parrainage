import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/ui";

/** Lien de retour au-dessus d'un titre de page (« ← Retour à Aïcha »). */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-6 w-fit items-center gap-1.5 text-14 font-semibold"
    >
      <ArrowLeftIcon size={16} />
      {children}
    </Link>
  );
}
