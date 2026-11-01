import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

/** Bouton présenté comme un lien (bascule d'un formulaire sans changer d'adresse). */
export function LinkButton({
  className,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-brand-700 underline hover:text-brand-900",
        className,
      )}
      {...props}
    />
  );
}

/** Classes des liens des pages d'authentification (soulignés comme dans la maquette). */
export const authLinkClass = "font-semibold underline";
