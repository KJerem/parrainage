import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ageAt,
  bulletinListSchema,
  FEED_PREVIEW_SIZE,
  feedPageSchema,
  filleulDashboardSchema,
  filleulListSchema,
  type BulletinList,
  type FeedPage,
  type FeedQuery,
  type FilleulDashboard,
  type FilleulList,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Prisma } from "../generated/prisma/client.js";
import { listedMedia, mediaRefSelect, toMediaRef } from "../media/media-ref.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  buildFeedPage,
  conditionsAfter,
  type CursorCondition,
  decodeFeedCursor,
  type FeedCursor,
  toMessageItem,
  toNewsItem,
} from "./feed.js";
import { summarizePayments } from "./payments.js";
import { type SentResultRow, summarizeResults, toBulletins } from "./results.js";

/** Messages de l'enfant visibles par le parrain destinataire. */
const DELIVERED_TO_PARRAIN = ["APPROVED", "MASKED"] as const;

const sponsorshipSelect = {
  id: true,
  parrainId: true,
  childId: true,
  monthlyAmountCents: true,
  startDate: true,
  conversation: { select: { id: true } },
  child: { select: { consentMedia: true } },
} satisfies Prisma.SponsorshipSelect;

type OwnedSponsorship = Prisma.SponsorshipGetPayload<{ select: typeof sponsorshipSelect }>;

const sentResultSelect = {
  id: true,
  className: true,
  averageX100: true,
  rank: true,
  classSize: true,
  appreciation: true,
  sentAt: true,
  period: { select: { schoolYear: true, kind: true, label: true } },
  media: listedMedia,
} satisfies Prisma.SchoolResultSelect;

function whereAfter<T>(
  conditions: CursorCondition[],
  build: (condition: CursorCondition) => T,
): { OR?: T[] } {
  return conditions.length === 0 ? {} : { OR: conditions.map(build) };
}

/**
 * Espace parrain « Mes filleuls ». Propriété : un binôme ACTIF entre le parrain connecté et
 * l'enfant, sinon 404 (jamais 403 : l'existence de l'enfant n'est pas révélée).
 */
@Injectable()
export class ParrainService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filleuls des binômes actifs, du plus ancien au plus récent (sélecteur). */
  async listFilleuls(userId: string): Promise<FilleulList> {
    const sponsorships = await this.prisma.sponsorship.findMany({
      where: { status: "ACTIVE", parrain: { userId } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: {
        child: { select: { id: true, firstName: true, lastInitial: true, avatarTone: true } },
      },
    });
    // Un enfant n'apparaît qu'une fois, au rang de son plus ancien binôme.
    const children = new Map<string, (typeof sponsorships)[number]["child"]>();
    for (const { child } of sponsorships) {
      if (!children.has(child.id)) {
        children.set(child.id, child);
      }
    }
    const filleuls = [...children.values()].map((child) => ({
      childId: child.id,
      firstName: child.firstName,
      lastInitial: child.lastInitial,
      avatarTone: child.avatarTone,
    }));
    return filleulListSchema.parse(filleuls);
  }

  async dashboard(userId: string, childId: string): Promise<FilleulDashboard> {
    const at = now();
    const sponsorship = await this.ownedSponsorship(userId, childId);
    const [child, feed, results, payments] = await Promise.all([
      this.prisma.child.findUniqueOrThrow({
        where: { id: childId },
        select: {
          id: true,
          firstName: true,
          lastInitial: true,
          gender: true,
          avatarTone: true,
          birthDate: true,
          className: true,
          consentMedia: true,
          school: { select: { fullName: true, city: true } },
          relais: { select: { displayName: true, city: true, country: true } },
          photo: { select: mediaRefSelect },
        },
      }),
      this.loadFeed(sponsorship, FEED_PREVIEW_SIZE, undefined, at),
      this.prisma.schoolResult.findMany({
        where: { childId, status: "SENT" },
        select: sentResultSelect,
      }),
      this.prisma.payment.findMany({
        where: { parrainId: sponsorship.parrainId, childId },
        select: {
          id: true,
          sponsorshipId: true,
          kind: true,
          status: true,
          amountCents: true,
          dueDate: true,
          paidAt: true,
          periodKey: true,
        },
      }),
    ]);
    // Sans consentement médias, ou photo sans fichier affichable : les initiales.
    const photo =
      child.consentMedia &&
      child.photo &&
      (child.photo.status === "READY" || child.photo.status === "PLACEHOLDER")
        ? toMediaRef(child.photo)
        : null;
    return filleulDashboardSchema.parse({
      now: at.toISOString(),
      conversationId: sponsorship.conversation?.id ?? null,
      child: {
        id: child.id,
        firstName: child.firstName,
        lastInitial: child.lastInitial,
        gender: child.gender,
        avatarTone: child.avatarTone,
        age: ageAt(child.birthDate, at),
        className: child.className,
        schoolFullName: child.school?.fullName ?? null,
        city: child.school?.city ?? child.relais.city,
        country: child.relais.country,
        relaisDisplayName: child.relais.displayName,
        sponsoredSince: sponsorship.startDate.toISOString().slice(0, 10),
        photo,
      },
      feed: feed.items,
      results: summarizeResults(results satisfies SentResultRow[]),
      payments: summarizePayments({
        sponsorshipId: sponsorship.id,
        monthlyAmountCents: sponsorship.monthlyAmountCents,
        payments,
        now: at,
      }),
    });
  }

  async feed(userId: string, childId: string, query: FeedQuery): Promise<FeedPage> {
    const cursor = query.cursor === undefined ? undefined : decodeFeedCursor(query.cursor);
    if (cursor === null) {
      throw new AppError(400, "Curseur de pagination invalide", {
        cursor: ["Curseur de pagination invalide"],
      });
    }
    const sponsorship = await this.ownedSponsorship(userId, childId);
    return feedPageSchema.parse(await this.loadFeed(sponsorship, query.limit, cursor, now()));
  }

  async bulletins(userId: string, childId: string): Promise<BulletinList> {
    await this.ownedSponsorship(userId, childId);
    const rows = await this.prisma.schoolResult.findMany({
      where: { childId, status: "SENT" },
      select: sentResultSelect,
    });
    return bulletinListSchema.parse({ items: toBulletins(rows) });
  }

  /** Binôme actif du parrain connecté avec cet enfant (le plus ancien), sinon 404. */
  private async ownedSponsorship(userId: string, childId: string): Promise<OwnedSponsorship> {
    const sponsorship = await this.prisma.sponsorship.findFirst({
      where: { childId, status: "ACTIVE", parrain: { userId } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: sponsorshipSelect,
    });
    if (!sponsorship) {
      throw new NotFoundException();
    }
    return sponsorship;
  }

  /**
   * Une page du fil : messages de l'enfant dans la conversation de CE binôme (approuvés ou
   * masqués) et nouvelles publiées qui l'incluent, datées au plus tard de `at`.
   */
  private async loadFeed(
    sponsorship: OwnedSponsorship,
    limit: number,
    cursor: FeedCursor | undefined,
    at: Date,
  ): Promise<FeedPage> {
    const conversationId = sponsorship.conversation?.id;
    const [messages, news] = await Promise.all([
      conversationId
        ? this.prisma.message.findMany({
            where: {
              conversationId,
              authorChildId: sponsorship.childId,
              moderationStatus: { in: [...DELIVERED_TO_PARRAIN] },
              AND: [
                { createdAt: { lte: at } },
                whereAfter(conditionsAfter(cursor, "message"), (c) =>
                  "dateBefore" in c
                    ? { createdAt: { lt: c.dateBefore } }
                    : {
                        createdAt: c.dateEquals,
                        ...(c.idBefore ? { id: { lt: c.idBefore } } : {}),
                      },
                ),
              ],
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit + 1,
            select: {
              id: true,
              createdAt: true,
              conversationId: true,
              sentFrom: true,
              body: true,
              redactedBody: true,
              moderationStatus: true,
              media: listedMedia,
            },
          })
        : Promise.resolve([]),
      this.prisma.newsPost.findMany({
        where: {
          status: "PUBLISHED",
          notifyParrains: true,
          children: { some: { childId: sponsorship.childId } },
          AND: [
            { publishedAt: { not: null, lte: at } },
            whereAfter(conditionsAfter(cursor, "news"), (c) =>
              "dateBefore" in c
                ? { publishedAt: { lt: c.dateBefore } }
                : { publishedAt: c.dateEquals, ...(c.idBefore ? { id: { lt: c.idBefore } } : {}) },
            ),
          ],
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          publishedAt: true,
          title: true,
          body: true,
          relais: { select: { displayName: true, city: true } },
          media: listedMedia,
        },
      }),
    ]);
    return buildFeedPage(
      news.map((row) => toNewsItem(row, sponsorship.child.consentMedia)),
      messages.map(toMessageItem),
      limit,
    );
  }
}
