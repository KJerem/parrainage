import type { ReactNode } from "react";

/** Mot composé gardé sur une ligne (« e-mail » ne se coupe pas au trait d'union). */
export function NoBreak({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>;
}
