import type { Metadata } from "next";
import { ChildrenTable } from "@/components/relais/children-table";
import { Button } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getRelaisChildren } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Enfants" };

export default async function RelaisChildrenPage() {
  await requireRole("relais");
  const { items, now } = await getRelaisChildren();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-30 font-extrabold max-sm:text-24">Enfants</h1>
        <Button href="/relais/enfants/nouveau">Ajouter un enfant</Button>
      </div>
      <section
        aria-labelledby="liste-enfants"
        className="relative min-w-0 overflow-hidden rounded-16 border border-line bg-white"
      >
        <h2
          id="liste-enfants"
          className="m-0 px-3.5 pt-4 pb-2 text-18 font-bold md:min-h-[58px] md:pb-0"
        >
          {items.length} {items.length > 1 ? "enfants" : "enfant"}
        </h2>
        <ChildrenTable rows={items} now={now} headingId="liste-enfants" />
      </section>
    </>
  );
}
