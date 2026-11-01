import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/parrain/back-link";
import { FeedTimeline } from "@/components/parrain/feed-timeline";
import { filleulHref, FilleulSwitcher } from "@/components/parrain/filleul-switcher";
import { NoNewsYet } from "@/components/parrain/latest-news";
import { firstParam } from "@/lib/auth-paths";
import { requireRole } from "@/lib/auth.server";
import { ofName } from "@/lib/labels";
import {
  feedPageSize,
  filleulPageTitle,
  getFeedPage,
  getFilleulDashboard,
  resolveFilleul,
} from "@/lib/parrain.server";

export async function generateMetadata({
  searchParams,
}: PageProps<"/parrain/nouvelles">): Promise<Metadata> {
  return {
    title: await filleulPageTitle(firstParam((await searchParams).filleul), "Tout le fil"),
  };
}

/** Fil complet d'un filleul : messages approuvés et nouvelles du relais, paginés. */
export default async function ToutLeFilPage({ searchParams }: PageProps<"/parrain/nouvelles">) {
  await requireRole("parrain");
  const { filleuls, childId } = await resolveFilleul(firstParam((await searchParams).filleul));
  if (!childId) {
    redirect("/parrain");
  }
  // Le tableau de bord donne l'instant de référence (« Hier ») et l'identité de l'enfant.
  const [{ child, now }, page] = await Promise.all([
    getFilleulDashboard(childId),
    getFeedPage(childId),
  ]);

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <BackLink href={filleulHref("/parrain", child.id)}>Retour à {child.firstName}</BackLink>
          <h1 className="m-0 text-26 font-extrabold tracking-[-0.01em] sm:text-32">Tout le fil</h1>
          <p className="m-0 text-15 text-muted">
            Messages {ofName(child.firstName)} et nouvelles de son relais, du plus récent au plus
            ancien.
          </p>
        </div>
        <FilleulSwitcher filleuls={filleuls} currentId={child.id} basePath="/parrain/nouvelles" />
      </div>
      {page.items.length > 0 ? (
        <FeedTimeline
          key={child.id}
          childId={child.id}
          child={{
            firstName: child.firstName,
            lastInitial: child.lastInitial,
            avatarTone: child.avatarTone,
          }}
          now={now}
          initialItems={page.items}
          initialCursor={page.nextCursor}
          pageSize={feedPageSize}
        />
      ) : (
        <NoNewsYet firstName={child.firstName} headingLevel="h2" />
      )}
    </div>
  );
}
