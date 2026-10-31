import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type TwoColumnProps = HTMLAttributes<HTMLDivElement> & {
  /** Colonne latérale de 320 px (prochain appel, à faire…). */
  aside: ReactNode;
  asideLabel?: string;
};

function TwoColumn({
  columns,
  asideGap,
  asideFirst = false,
  aside,
  asideLabel,
  className,
  children,
  ...props
}: TwoColumnProps & { columns: string; asideGap: string; asideFirst?: boolean }) {
  const side = (
    <aside aria-label={asideLabel} className={cn("flex min-w-0 flex-col", asideGap)}>
      {aside}
    </aside>
  );
  return (
    <div className={cn("grid items-start gap-6", columns, className)} {...props}>
      {asideFirst ? side : null}
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      {asideFirst ? null : side}
    </div>
  );
}

export type TwoColumnParrainProps = TwoColumnProps & {
  /** Colonne latérale à gauche, de 280 px (Enfant.dc.html) ; elle passe aussi en premier sous lg. */
  asideFirst?: boolean;
};

/** Parrain et enfant : deux colonnes à partir de lg, empilées en dessous. */
export function TwoColumnParrain({ asideFirst, ...props }: TwoColumnParrainProps) {
  return (
    <TwoColumn
      {...props}
      asideFirst={asideFirst}
      asideGap={asideFirst ? "gap-4" : "gap-6"}
      columns={
        asideFirst ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_320px]"
      }
    />
  );
}

/** Relais et bureau (barre latérale de 232 px) : deux colonnes seulement à partir de xl. */
export function TwoColumnWide(props: TwoColumnProps) {
  return <TwoColumn {...props} asideGap="gap-5" columns="xl:grid-cols-[minmax(0,1fr)_320px]" />;
}

export type ListDetailProps = HTMLAttributes<HTMLDivElement> & {
  /** Liste de 280 px (conversations, file de modération). */
  list: ReactNode;
  /** `stretch` : liste et détail de même hauteur (P-Messages). */
  align?: "start" | "stretch";
};

/** Liste et détail côte à côte à partir de md, empilés en dessous. */
export function ListDetail({
  list,
  align = "start",
  className,
  children,
  ...props
}: ListDetailProps) {
  return (
    <div
      className={cn(
        "grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]",
        align === "start" ? "items-start" : "items-stretch",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col">{list}</div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
