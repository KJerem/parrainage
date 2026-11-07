import type { Metadata } from "next";
import { TodoRow } from "@/components/relais/relais-home-mobile";
import { relaisTodos } from "@/components/relais/relais-labels";
import { BellIcon, Card, EmptyState } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { getRelaisHome } from "@/lib/relais.server";

export const metadata: Metadata = { title: "Notifications" };

// Ce qui demande l'attention du relais, calculé à chaque visite : messages, bulletins, dossiers à
// finir et enfants sans nouvelle depuis 60 jours.
export default async function RelaisNotificationsPage() {
  await requireRole("relais");
  const todos = relaisTodos(await getRelaisHome());
  return (
    <>
      <h1 className="m-0 hidden text-30 font-extrabold md:block">Notifications</h1>
      {todos.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<BellIcon size={26} />}
            title="Rien de nouveau"
            description="Les messages, les bulletins à saisir et les enfants à suivre s'afficheront ici."
          />
        </Card>
      ) : (
        <div className="divide-y divide-line-soft overflow-hidden rounded-14 border border-line bg-white">
          {todos.map((todo) => (
            <TodoRow key={todo.key} todo={todo} />
          ))}
        </div>
      )}
    </>
  );
}
