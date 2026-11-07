import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type CreatedNews, type CreateNews, type ScheduledNewsList } from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import { Prisma } from "../generated/prisma/client.js";
import { newsPublishedBureauEmail, newsPublishedEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { attachableMediaWhere, INVALID_MEDIA_MESSAGE } from "../media/attach.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FOLLOWED_STATUSES, type RelaisActor } from "./relais-common.js";

const SCHEDULE_MIN_DELAY_MS = 60 * 1000;
const SCHEDULE_MAX_DELAY_MS = 365 * 24 * 60 * 60 * 1000;
/** Nouvelles programmées publiées par passage du planificateur. */
const PUBLISH_BATCH_SIZE = 50;

const NOT_FOUND = () => new AppError(404, "Cette nouvelle n'existe pas ou a déjà été publiée");

const createdSelect = {
  id: true,
  status: true,
  publishedAt: true,
  scheduledAt: true,
  children: { select: { childId: true } },
} as const satisfies Prisma.NewsPostSelect;

type CreatedRow = Prisma.NewsPostGetPayload<{ select: typeof createdSelect }>;

/**
 * Nouvelles d'un relais : publication immédiate ou programmée, rejouable par sa clé d'idempotence.
 * Les parrains sont prévenus par un lien, une seule fois chacun, à la parution.
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  async create(
    actor: RelaisActor,
    input: CreateNews,
  ): Promise<{ news: CreatedNews; replayed: boolean }> {
    const key = `${actor.userId}:${input.idempotencyKey}`;
    const replay = await this.findByKey(key);
    if (replay) {
      return { news: await this.toCreated(replay), replayed: true };
    }
    const at = now();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    this.checkSchedule(scheduledAt, at);
    const childIds = await this.targetChildren(actor, input);
    await this.checkMedia(actor, input.mediaIds);

    let row: CreatedRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.newsPost.create({
          data: {
            relaisId: actor.relaisId,
            authorUserId: actor.userId,
            type: input.type,
            status: scheduledAt ? "SCHEDULED" : "PUBLISHED",
            title: input.title,
            body: input.body,
            notifyParrains: input.notifyParrains,
            notifyBureau: input.notifyBureau,
            visibleToChildren: input.visibleToChildren,
            scheduledAt,
            publishedAt: scheduledAt ? null : at,
            idempotencyKey: key,
            children: { create: childIds.map((childId) => ({ childId })) },
          },
          select: createdSelect,
        });
        for (const [position, mediaId] of input.mediaIds.entries()) {
          const { count } = await tx.media.updateMany({
            where: { ...attachableMediaWhere(actor.userId, [mediaId]) },
            data: { newsPostId: created.id, position },
          });
          if (count !== 1) {
            throw new AppError(422, INVALID_MEDIA_MESSAGE);
          }
        }
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.findByKey(key);
        if (raced) {
          return { news: await this.toCreated(raced), replayed: true };
        }
      }
      throw error;
    }
    if (row.status === "PUBLISHED") {
      await this.notify(row.id);
    }
    return { news: await this.toCreated(row), replayed: false };
  }

  async scheduled(actor: RelaisActor): Promise<ScheduledNewsList> {
    const rows = await this.prisma.newsPost.findMany({
      where: { relaisId: actor.relaisId, status: "SCHEDULED", scheduledAt: { not: null } },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        _count: { select: { children: true } },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        scheduledAt: row.scheduledAt!.toISOString(),
        childCount: row._count.children,
      })),
      now: now().toISOString(),
    };
  }

  /** Annule une nouvelle programmée ; ses fichiers, détachés, partiront avec la purge. */
  async cancel(actor: RelaisActor, id: string): Promise<void> {
    const { count } = await this.prisma.newsPost.deleteMany({
      where: { id, relaisId: actor.relaisId, status: "SCHEDULED" },
    });
    if (count === 0) {
      throw NOT_FOUND();
    }
  }

  /**
   * Publie les nouvelles dont l'heure est venue (planificateur). La date de parution reste celle
   * annoncée. Une nouvelle déjà prise par un autre passage est ignorée, sans double e-mail.
   */
  async publishDue(at: Date = now()): Promise<number> {
    const due = await this.prisma.newsPost.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: at } },
      orderBy: { scheduledAt: "asc" },
      take: PUBLISH_BATCH_SIZE,
      select: { id: true, scheduledAt: true },
    });
    let published = 0;
    for (const { id, scheduledAt } of due) {
      const { count } = await this.prisma.newsPost.updateMany({
        where: { id, status: "SCHEDULED" },
        data: { status: "PUBLISHED", publishedAt: scheduledAt },
      });
      if (count === 1) {
        published += 1;
        await this.notify(id).catch((error: unknown) => {
          this.logger.error(
            `Nouvelle ${id} : parrains non prévenus`,
            error instanceof Error ? error.stack : String(error),
          );
        });
      }
    }
    return published;
  }

  private findByKey(key: string): Promise<CreatedRow | null> {
    return this.prisma.newsPost.findUnique({
      where: { idempotencyKey: key },
      select: createdSelect,
    });
  }

  private async toCreated(row: CreatedRow): Promise<CreatedNews> {
    const childIds = row.children.map((c) => c.childId);
    const sponsors = await this.prisma.sponsorship.findMany({
      where: { childId: { in: childIds }, status: "ACTIVE" },
      distinct: ["parrainId"],
      select: { parrainId: true },
    });
    return {
      id: row.id,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      childCount: childIds.length,
      parrainCount: sponsors.length,
    };
  }

  private checkSchedule(scheduledAt: Date | null, at: Date): void {
    if (!scheduledAt) {
      return;
    }
    const delay = scheduledAt.getTime() - at.getTime();
    if (delay < SCHEDULE_MIN_DELAY_MS || delay > SCHEDULE_MAX_DELAY_MS) {
      const issue =
        delay < SCHEDULE_MIN_DELAY_MS
          ? "Choisissez une date à venir"
          : "Choisissez une date dans l'année qui vient";
      throw new AppError(422, issue, { scheduledAt: [issue] });
    }
  }

  /** Enfants de la nouvelle : tous ceux du relais pour « Vie du relais », sinon ceux choisis. */
  private async targetChildren(actor: RelaisActor, input: CreateNews): Promise<string[]> {
    const followed = {
      relaisId: actor.relaisId,
      fileStatus: { in: [...FOLLOWED_STATUSES] },
    } satisfies Prisma.ChildWhereInput;
    if (input.type === "RELAIS_LIFE") {
      const all = await this.prisma.child.findMany({ where: followed, select: { id: true } });
      if (all.length === 0) {
        const issue = "Votre relais ne suit encore aucun enfant";
        throw new AppError(422, issue, { childIds: [issue] });
      }
      return all.map((child) => child.id);
    }
    const owned = await this.prisma.child.count({
      where: { ...followed, id: { in: input.childIds } },
    });
    if (owned !== input.childIds.length) {
      const issue = "Un enfant choisi n'est pas suivi par votre relais";
      throw new AppError(422, issue, { childIds: [issue] });
    }
    return input.childIds;
  }

  private async checkMedia(actor: RelaisActor, mediaIds: readonly string[]): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    const usable = await this.prisma.media.count({
      where: attachableMediaWhere(actor.userId, mediaIds),
    });
    if (usable !== mediaIds.length) {
      throw new AppError(422, INVALID_MEDIA_MESSAGE, { mediaIds: [INVALID_MEDIA_MESSAGE] });
    }
  }

  /** Un e-mail par parrain concerné, même s'il parraine plusieurs de ces enfants. */
  private async notify(newsId: string): Promise<void> {
    const post = await this.prisma.newsPost.findUniqueOrThrow({
      where: { id: newsId },
      select: {
        notifyParrains: true,
        notifyBureau: true,
        children: { select: { childId: true } },
      },
    });
    const active = {
      OR: [{ banned: null }, { banned: false }],
    } satisfies Prisma.UserWhereInput;
    if (post.notifyParrains) {
      const users = await this.prisma.user.findMany({
        where: {
          ...active,
          parrainProfile: {
            sponsorships: {
              some: { status: "ACTIVE", childId: { in: post.children.map((c) => c.childId) } },
            },
          },
        },
        select: { email: true },
      });
      const url = new URL("/parrain", this.appUrl).toString();
      for (const user of users) {
        sendMailInBackground({ to: user.email, ...newsPublishedEmail(url) });
      }
    }
    if (post.notifyBureau) {
      const users = await this.prisma.user.findMany({
        where: { ...active, role: "bureau" },
        select: { email: true },
      });
      const url = new URL("/bureau", this.appUrl).toString();
      for (const user of users) {
        sendMailInBackground({ to: user.email, ...newsPublishedBureauEmail(url) });
      }
    }
  }
}
