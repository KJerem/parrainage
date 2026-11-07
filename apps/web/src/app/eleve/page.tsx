import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EleveLogin } from "@/components/eleve/eleve-login";
import { KidShell } from "@/components/layout";
import { LockIcon } from "@/components/ui";
import { CHILD_COOKIE, loginPath } from "@/lib/auth-paths";
import { getEleveSession, isChildSignedIn } from "@/lib/eleve.server";
import { formatHour, RELAIS_TIME_ZONE } from "@/lib/format";

export const metadata: Metadata = { title: "Connexion" };

const Logo = (
  <span className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-brand-700 text-14 font-extrabold text-white">
    LRT
  </span>
);

const adultLink = (
  <Link href={loginPath("/relais/sessions")} className="self-start text-14 text-muted">
    Espace adulte
  </Link>
);

function NoEntry({ title, children }: { title: string; children: ReactNode }) {
  return (
    <KidShell title="Écrire à mon parrain" leading={Logo} titleClassName="text-18 font-bold">
      <section className="flex flex-col items-center gap-4 rounded-20 border border-kid-line bg-white px-6 py-12 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <LockIcon size={30} />
        </span>
        <h1 className="m-0 text-26 font-extrabold sm:text-32">{title}</h1>
        <p className="m-0 max-w-xl text-18 text-ink-soft">{children}</p>
      </section>
      {adultLink}
    </KidShell>
  );
}

// E-Connexion.dc.html : seulement sur le poste où le relais a ouvert une session.
export default async function ElevePage() {
  const session = await getEleveSession();
  if (!session) {
    return (
      <NoEntry title="Aucune session ouverte sur ce poste">
        Demande à ton relais d&apos;ouvrir une session pour écrire à ton parrain ou à ta marraine.
      </NoEntry>
    );
  }
  if (session.state === "suspended") {
    return (
      <NoEntry title="La session est en pause">
        Il y a eu trop d&apos;erreurs sur ce poste. Appelle {session.relaisName} : c&apos;est lui
        qui peut la reprendre.
      </NoEntry>
    );
  }
  if ((await cookies()).has(CHILD_COOKIE) && (await isChildSignedIn())) {
    redirect("/eleve/messages");
  }
  return (
    <KidShell
      title="Écrire à mon parrain"
      leading={Logo}
      titleClassName="text-18 font-bold"
      session={`Session ouverte par ${session.relaisName} · jusqu'à ${formatHour(session.endsAt, RELAIS_TIME_ZONE)}`}
      sessionIcon={false}
      mainClassName="gap-8 pt-9 pb-12"
    >
      <EleveLogin session={session} />
      {adultLink}
    </KidShell>
  );
}
