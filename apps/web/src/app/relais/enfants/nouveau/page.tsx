import { schoolYearOf } from "@parrainage/contracts";
import type { Metadata } from "next";
import { ChildForm } from "@/components/relais/child-form";
import { requireRole } from "@/lib/auth.server";
import { getChildCodeProposal, getRelaisChildren, getSchools } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Ajouter un enfant" };

export default async function NewChildPage() {
  await requireRole("relais");
  const [schools, proposal, { now }] = await Promise.all([
    getSchools(),
    getChildCodeProposal(),
    getRelaisChildren(),
  ]);
  return (
    <ChildForm
      schools={schools.items}
      proposal={proposal}
      schoolYear={schoolYearOf(new Date(now))}
      now={now}
    />
  );
}
