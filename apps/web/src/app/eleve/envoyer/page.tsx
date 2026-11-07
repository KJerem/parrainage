import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SessionWatch } from "@/components/eleve/eleve-chrome";
import { type EleveSendType, eleveSendTypes } from "@/components/eleve/eleve-labels";
import { EleveSend } from "@/components/eleve/eleve-send";
import { KidShell } from "@/components/layout";
import { cn } from "@/lib/cn";
import { getEleveHome } from "@/lib/eleve.server";
import { formatHour, RELAIS_TIME_ZONE } from "@/lib/format";

export const metadata: Metadata = { title: "Envoyer quelque chose" };

const tabLabels: Readonly<Record<EleveSendType, string>> = {
  photo: "Une photo",
  video: "Une vidéo",
  bulletin: "Mon bulletin",
};

// E-Bulletin.dc.html : photo, vidéo ou bulletin, selon ce que la session permet.
export default async function EleveEnvoyerPage({ searchParams }: PageProps<"/eleve/envoyer">) {
  const home = await getEleveHome();
  const { type, avec } = await searchParams;
  const sponsors = home.threads.filter((thread) => thread.kind === "sponsor");
  const thread = sponsors.find((candidate) => candidate.id === avec) ?? sponsors[0];
  const allowed = eleveSendTypes.filter((candidate) =>
    candidate === "bulletin" ? home.rights.bulletin : home.rights.media,
  );
  const current = allowed.find((candidate) => candidate === type) ?? allowed[0];
  if (!thread || !current) {
    redirect("/eleve/messages");
  }
  const query = (next: EleveSendType) =>
    `/eleve/envoyer?type=${next}&avec=${encodeURIComponent(thread.id)}`;

  return (
    <KidShell
      title={
        <span className="block text-20 sm:text-22">Envoyer quelque chose à {thread.name}</span>
      }
      session={`Session jusqu'à ${formatHour(home.endsAt, RELAIS_TIME_ZONE)}`}
      sessionIcon={false}
      backHref={`/eleve/messages?avec=${encodeURIComponent(thread.id)}`}
    >
      <SessionWatch endsAt={home.endsAt} now={home.now} />
      <h1 className="sr-only">{tabLabels[current]}</h1>
      {allowed.length > 1 ? (
        <nav aria-label="Ce que tu envoies" className="flex flex-wrap gap-2.5">
          {allowed.map((candidate) => (
            <Link
              key={candidate}
              href={query(candidate)}
              aria-current={candidate === current ? "page" : undefined}
              className={cn(
                "flex min-h-14 items-center rounded-14 border-2 px-5 text-18 font-bold no-underline",
                candidate === current
                  ? "border-brand-700 bg-brand-700 text-white hover:text-white"
                  : "border-kid-line bg-white text-ink hover:text-ink",
              )}
            >
              {tabLabels[candidate]}
            </Link>
          ))}
        </nav>
      ) : null}
      <EleveSend key={current} type={current} thread={thread} />
    </KidShell>
  );
}
