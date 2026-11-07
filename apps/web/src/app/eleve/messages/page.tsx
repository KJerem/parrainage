import type { Metadata } from "next";
import Link from "next/link";
import { FinishButton, SessionWatch } from "@/components/eleve/eleve-chrome";
import { EleveComposer, EleveThreadView } from "@/components/eleve/eleve-messages";
import { KidShell } from "@/components/layout";
import { Avatar, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getEleveHome, getEleveMessages } from "@/lib/eleve.server";
import { formatHour, formatRelativeDay, RELAIS_TIME_ZONE } from "@/lib/format";

export const metadata: Metadata = { title: "Mes messages" };

// Enfant.dc.html : le fil avec le parrain, et ce que l'enfant peut lui envoyer.
export default async function EleveMessagesPage({ searchParams }: PageProps<"/eleve/messages">) {
  const home = await getEleveHome();
  const { avec } = await searchParams;
  const sponsors = home.threads.filter((thread) => thread.kind === "sponsor");
  const thread = home.threads.find((candidate) => candidate.id === avec) ?? home.threads[0];
  const messages = thread ? await getEleveMessages(thread.id) : null;
  const closes = formatHour(home.endsAt, RELAIS_TIME_ZONE);

  return (
    <KidShell
      title={`Bonjour ${home.child.firstName} !`}
      leading={<Avatar size={48} tone={home.child.avatarTone} initials={home.child.initials} />}
      session={`Session ouverte par ${home.relaisName} · se ferme à ${closes}`}
      sessionIcon={false}
      finish={<FinishButton />}
    >
      <SessionWatch endsAt={home.endsAt} now={home.now} />
      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside aria-label="Mon parrain" className="flex flex-col gap-4">
          {sponsors.length === 0 ? (
            <Card variant="kid" padding="xl" className="flex flex-col gap-2 text-center">
              <p className="m-0 text-20 font-extrabold">Tu n&apos;as pas encore de parrain</p>
              <p className="m-0 text-16 text-ink-soft">
                {home.relaisName} te préviendra dès qu&apos;une personne te parrainera.
              </p>
            </Card>
          ) : (
            sponsors.map((sponsor) => (
              <Card
                key={sponsor.id}
                variant="kid"
                padding="xl"
                className="flex flex-col items-center gap-3 text-center"
              >
                <Avatar size={96} tone="info-strong" initials={sponsor.initials} />
                <p className="m-0 text-15 font-semibold text-muted">{sponsor.title}</p>
                <p className="m-0 text-26 font-extrabold">{sponsor.name}</p>
                <p className="m-0 text-15 text-ink-soft">{sponsor.place}</p>
              </Card>
            ))
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {thread && messages ? (
            <section
              aria-labelledby="conversation"
              className="flex min-w-0 flex-col overflow-hidden rounded-20 border border-kid-line bg-white"
            >
              <h1
                id="conversation"
                className="m-0 border-b border-kid-line-soft px-6 py-5 text-22 font-extrabold"
              >
                {thread.kind === "sponsor"
                  ? `Mes messages avec ${thread.name}`
                  : "Mes messages avec l'association"}
              </h1>
              {home.threads.length > 1 ? (
                <nav
                  aria-label="Choisir à qui écrire"
                  className="flex flex-wrap gap-2 border-b border-kid-line-soft px-6 py-3"
                >
                  {home.threads.map((candidate) => (
                    <Link
                      key={candidate.id}
                      href={`/eleve/messages?avec=${encodeURIComponent(candidate.id)}`}
                      aria-current={candidate.id === thread.id ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center rounded-12 border-2 px-4 text-16 font-bold no-underline",
                        candidate.id === thread.id
                          ? "border-brand-700 bg-brand-100 text-brand-700"
                          : "border-kid-line text-ink hover:text-ink",
                      )}
                    >
                      {candidate.name}
                    </Link>
                  ))}
                </nav>
              ) : null}
              <EleveThreadView
                key={thread.id}
                thread={thread}
                messages={messages.items}
                relaisName={home.relaisName}
                now={messages.now}
              />
              <EleveComposer key={`composer-${thread.id}`} thread={thread} rights={home.rights} />
            </section>
          ) : (
            <h1 className="sr-only">Mes messages</h1>
          )}

          {home.news.length > 0 ? (
            <section
              aria-labelledby="nouvelles"
              className="flex flex-col gap-3 rounded-20 border border-kid-line bg-white p-6 max-sm:p-4"
            >
              <h2 id="nouvelles" className="m-0 text-20 font-extrabold">
                Les nouvelles de ton école
              </h2>
              {home.news.map((news) => (
                <article key={news.id} className="flex flex-col gap-1 rounded-14 bg-kid-canvas p-4">
                  <h3 className="m-0 text-18 font-bold">{news.title}</h3>
                  <p className="m-0 text-13 text-muted">
                    {formatRelativeDay(news.publishedAt, home.now, {
                      timeZone: RELAIS_TIME_ZONE,
                    })}
                  </p>
                  <p className="m-0 text-16 leading-[1.5] whitespace-pre-line">{news.body}</p>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      </div>
    </KidShell>
  );
}
