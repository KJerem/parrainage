import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card, CardTitle } from "@/components/ui";
import { requireRole } from "@/lib/auth.server";
import { roleLabels } from "@/lib/roles";

export const metadata: Metadata = { title: "Mon compte" };

export default async function ParrainComptePage() {
  const me = await requireRole("parrain");
  const rows = [
    { label: "Nom", value: me.parrain?.displayName ?? me.user.name },
    { label: "Adresse e-mail", value: me.user.email },
    { label: "Rôle", value: roleLabels[me.user.role] },
  ];
  return (
    <>
      <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">Mon compte</h1>
      <Card
        as="section"
        aria-labelledby="compte-identite"
        className="flex max-w-[640px] flex-col gap-4"
      >
        <CardTitle id="compte-identite">Identité</CardTitle>
        <dl className="m-0 flex flex-col gap-3.5">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
              <dt className="text-14 font-semibold text-muted sm:w-40 sm:shrink-0">{row.label}</dt>
              <dd className="m-0 min-w-0 text-15 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card
        as="section"
        aria-labelledby="compte-session"
        className="flex max-w-[640px] flex-col items-start gap-3"
      >
        <CardTitle id="compte-session">Session</CardTitle>
        <p className="m-0 text-14 leading-[1.5] text-ink-soft">
          Sur un ordinateur partagé, pensez à vous déconnecter après chaque visite.
        </p>
        <LogoutButton />
      </Card>
    </>
  );
}
