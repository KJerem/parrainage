import type { Metadata } from "next";
import { ChildForm } from "@/components/relais/child-form";
import { requireRole } from "@/lib/auth.server";
import { getChildCodeProposal, getRelaisChild, getSchools } from "@/lib/relais.server";

type Props = PageProps<"/relais/enfants/[childId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const child = await getRelaisChild((await params).childId);
  return { title: `${child.firstName} ${child.lastInitial}.` };
}

// Fiche d'un enfant ; un enfant d'un autre relais répond 404 (notFound dans getRelaisChild).
export default async function ChildPage({ params }: Props) {
  await requireRole("relais");
  const { childId } = await params;
  const [child, schools] = await Promise.all([getRelaisChild(childId), getSchools()]);
  // Un brouillon reçoit son code à l'envoi au bureau : le serveur en propose un.
  const proposal = child.fileStatus === "DRAFT" ? await getChildCodeProposal() : null;
  return (
    <ChildForm
      child={child}
      schools={schools.items}
      proposal={proposal}
      schoolYear={child.schoolYear}
      now={child.now}
    />
  );
}
