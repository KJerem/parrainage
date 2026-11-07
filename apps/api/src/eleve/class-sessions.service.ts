import { Injectable } from "@nestjs/common";
import {
  type ClassSessionDuration,
  classSessionDurationSchema,
  type ClassSessionRights,
  type OpenClassSession,
  type PlanClassSession,
  type PlannedClassSession,
  type RelaisSessions,
  relaisSessionsSchema,
  initials,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Prisma } from "../generated/prisma/client.js";
import { childName, tone } from "../messaging/present.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { FOLLOWED_STATUSES, type RelaisActor } from "../relais/relais-common.js";
import { hashDeviceToken, newDeviceToken } from "./child-session.js";

const NOT_FOUND = () => new AppError(404, "Cette session n'existe pas ou n'est pas la vôtre");
const ALREADY_OPEN =
  "Une session est déjà ouverte. Fermez-la avant d'en ouvrir une autre : un seul poste à la fois.";
const NOT_OPEN = "Cette session n'est plus ouverte";

/** Sessions passées listées dans « Sessions récentes ». */
const RECENT_SESSIONS = 5;

const rightsSelect = {
  allowWriteSponsor: true,
  allowMedia: true,
  allowBulletin: true,
  allowWriteAssociation: true,
} as const satisfies Prisma.ClassSessionSelect;

function toRights(row: Prisma.ClassSessionGetPayload<{ select: typeof rightsSelect }>) {
  return {
    writeSponsor: row.allowWriteSponsor,
    media: row.allowMedia,
    bulletin: row.allowBulletin,
    writeAssociation: row.allowWriteAssociation,
  } satisfies ClassSessionRights;
}

const fromRights = (rights: ClassSessionRights) => ({
  allowWriteSponsor: rights.writeSponsor,
  allowMedia: rights.media,
  allowBulletin: rights.bulletin,
  allowWriteAssociation: rights.writeAssociation,
});

const durationOf = (minutes: number): ClassSessionDuration =>
  classSessionDurationSchema.parse(minutes);

/** Une session planifiée reste proposée toute sa journée (on l'ouvre souvent un peu en retard). */
const startOfDay = (at: Date) =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

/** Sessions élèves vues du relais : chaque requête est bornée à ses enfants et à ses sessions. */
@Injectable()
export class ClassSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: RelaisActor): Promise<RelaisSessions> {
    const at = now();
    await this.closeExpired(at, actor.relaisId);
    const { relaisId } = actor;
    const [children, planned, current, recent] = await Promise.all([
      this.prisma.child.findMany({
        where: { relaisId, fileStatus: { in: [...FOLLOWED_STATUSES] } },
        select: {
          id: true,
          firstName: true,
          lastInitial: true,
          avatarTone: true,
          codeHash: true,
          codeLockedAt: true,
          consentMedia: true,
          sponsorships: { where: { status: "ACTIVE" }, take: 1, select: { id: true } },
        },
      }),
      this.prisma.classSession.findMany({
        where: { relaisId, status: "PLANNED", scheduledAt: { gte: startOfDay(at) } },
        orderBy: { scheduledAt: "asc" },
        select: {
          ...rightsSelect,
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          children: { select: { childId: true } },
        },
      }),
      this.prisma.classSession.findFirst({
        where: { relaisId, status: "OPEN" },
        select: {
          ...rightsSelect,
          id: true,
          openedAt: true,
          endsAt: true,
          durationMinutes: true,
          suspendedAt: true,
          sendCount: true,
          children: {
            select: {
              lastLoginAt: true,
              child: {
                select: {
                  id: true,
                  firstName: true,
                  lastInitial: true,
                  avatarTone: true,
                  codeLockedAt: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.classSession.findMany({
        where: { relaisId, status: "CLOSED", openedAt: { not: null } },
        orderBy: { openedAt: "desc" },
        take: RECENT_SESSIONS,
        select: {
          id: true,
          openedAt: true,
          sendCount: true,
          _count: { select: { children: true } },
        },
      }),
    ]);
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "fr");
    return relaisSessionsSchema.parse({
      now: at.toISOString(),
      eligible: children
        .map((child) => ({
          id: child.id,
          name: childName(child),
          initials: initials(childName(child)),
          avatarTone: tone(child.avatarTone, "amber"),
          hasSponsor: child.sponsorships.length > 0,
          hasCode: child.codeHash !== null,
          locked: child.codeLockedAt !== null,
          consentMedia: child.consentMedia,
        }))
        .sort(byName),
      planned: planned.map((session): PlannedClassSession => ({
        id: session.id,
        scheduledAt: (session.scheduledAt ?? at).toISOString(),
        durationMinutes: durationOf(session.durationMinutes),
        rights: toRights(session),
        childIds: session.children.map((link) => link.childId),
      })),
      current: current
        ? {
            id: current.id,
            openedAt: (current.openedAt ?? at).toISOString(),
            endsAt: (current.endsAt ?? at).toISOString(),
            durationMinutes: durationOf(current.durationMinutes),
            rights: toRights(current),
            suspended: current.suspendedAt !== null,
            sendCount: current.sendCount,
            children: current.children
              .map(({ lastLoginAt, child }) => ({
                id: child.id,
                name: childName(child),
                initials: initials(childName(child)),
                avatarTone: tone(child.avatarTone, "amber"),
                lastLoginAt: lastLoginAt?.toISOString() ?? null,
                locked: child.codeLockedAt !== null,
              }))
              .sort(byName),
          }
        : null,
      recent: recent.map((session) => ({
        id: session.id,
        openedAt: (session.openedAt ?? at).toISOString(),
        childCount: session._count.children,
        sendCount: session.sendCount,
      })),
    });
  }

  /** Enfants suivis par ce relais, sinon 422 : la liste ne se fabrique pas à la main. */
  private async sessionChildren(actor: RelaisActor, childIds: readonly string[]) {
    const children = await this.prisma.child.findMany({
      where: {
        id: { in: [...childIds] },
        relaisId: actor.relaisId,
        fileStatus: { in: [...FOLLOWED_STATUSES] },
      },
      select: { id: true, firstName: true, codeHash: true },
    });
    if (children.length !== childIds.length) {
      const message = "Un enfant choisi n'est pas suivi par votre relais";
      throw new AppError(422, message, { childIds: [message] });
    }
    return children;
  }

  async plan(actor: RelaisActor, input: PlanClassSession): Promise<PlannedClassSession> {
    const at = now();
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= at) {
      const message = "Choisissez une date à venir";
      throw new AppError(422, message, { scheduledAt: [message] });
    }
    await this.sessionChildren(actor, input.childIds);
    const session = await this.prisma.classSession.create({
      data: {
        relaisId: actor.relaisId,
        status: "PLANNED",
        scheduledAt,
        durationMinutes: input.durationMinutes,
        ...fromRights(input.rights),
        createdById: actor.userId,
        createdAt: at,
        children: { create: input.childIds.map((childId) => ({ childId })) },
      },
      select: { id: true },
    });
    return {
      id: session.id,
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes: input.durationMinutes,
      rights: input.rights,
      childIds: input.childIds,
    };
  }

  async removePlanned(actor: RelaisActor, id: string): Promise<void> {
    const { count } = await this.prisma.classSession.deleteMany({
      where: { id, relaisId: actor.relaisId, status: "PLANNED" },
    });
    if (count === 0) {
      throw NOT_FOUND();
    }
  }

  /**
   * Ouvre une session sur ce poste : droits figés, liste fermée, jeton de poste dont seule
   * l'empreinte est gardée. Le verrou sur la ligne du relais garantit une seule session ouverte,
   * même avec deux ouvertures simultanées.
   */
  async open(
    actor: RelaisActor,
    input: OpenClassSession,
  ): Promise<{ id: string; endsAt: Date; dev: string }> {
    const at = now();
    await this.closeExpired(at, actor.relaisId);
    const children = await this.sessionChildren(actor, input.childIds);
    const withoutCode = children.filter((child) => child.codeHash === null);
    if (withoutCode.length > 0) {
      const message = `${withoutCode.map((child) => child.firstName).join(", ")} n'a pas encore de code image`;
      throw new AppError(422, message, { childIds: [message] });
    }
    const dev = newDeviceToken();
    const endsAt = new Date(at.getTime() + input.durationMinutes * 60_000);
    const data = {
      status: "OPEN",
      durationMinutes: input.durationMinutes,
      ...fromRights(input.rights),
      openedAt: at,
      endsAt,
      deviceTokenHash: hashDeviceToken(dev),
      failedAttempts: 0,
      suspendedAt: null,
      sendCount: 0,
    } as const;
    const links = input.childIds.map((childId) => ({ childId }));
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Relais" WHERE "id" = ${actor.relaisId} FOR UPDATE`;
      const open = await tx.classSession.count({
        where: { relaisId: actor.relaisId, status: "OPEN" },
      });
      if (open > 0) {
        throw new AppError(409, ALREADY_OPEN);
      }
      let sessionId: string;
      if (input.plannedSessionId) {
        const { count } = await tx.classSession.updateMany({
          where: { id: input.plannedSessionId, relaisId: actor.relaisId, status: "PLANNED" },
          data,
        });
        if (count === 0) {
          throw NOT_FOUND();
        }
        sessionId = input.plannedSessionId;
        await tx.classSessionChild.deleteMany({ where: { sessionId } });
        await tx.classSessionChild.createMany({
          data: links.map((link) => ({ ...link, sessionId })),
        });
      } else {
        const created = await tx.classSession.create({
          data: {
            ...data,
            relaisId: actor.relaisId,
            createdById: actor.userId,
            createdAt: at,
            children: { create: links },
          },
          select: { id: true },
        });
        sessionId = created.id;
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "session.open",
          entityType: "ClassSession",
          entityId: sessionId,
          metadata: {
            childCount: input.childIds.length,
            durationMinutes: input.durationMinutes,
            rights: input.rights,
          },
          createdAt: at,
        },
      });
      return sessionId;
    });
    return { id, endsAt, dev };
  }

  /** Le relais quitte ce poste : sa session d'adulte n'existe plus, côté serveur. */
  async signOutAdult(authSessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: authSessionId } });
  }

  async close(actor: RelaisActor, id: string): Promise<void> {
    const at = now();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.classSession.updateMany({
        where: { id, relaisId: actor.relaisId, status: "OPEN" },
        data: { status: "CLOSED", closedAt: at },
      });
      if (count === 0) {
        throw NOT_FOUND();
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "session.close",
          entityType: "ClassSession",
          entityId: id,
          createdAt: at,
        },
      });
    });
  }

  /** Lève le verrou d'un enfant de cette session : il retrouve ses 3 essais. */
  async unlock(actor: RelaisActor, id: string, childId: string): Promise<void> {
    const at = now();
    await this.currentSession(actor, id);
    const link = await this.prisma.classSessionChild.findUnique({
      where: { sessionId_childId: { sessionId: id, childId } },
      select: { childId: true },
    });
    if (!link) {
      throw new AppError(404, "Cet enfant ne fait pas partie de cette session");
    }
    await this.prisma.$transaction([
      this.prisma.child.update({
        where: { id: childId },
        data: { failedCodeAttempts: 0, codeLockedAt: null },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "session.unlock",
          entityType: "ClassSession",
          entityId: id,
          metadata: { childId },
          createdAt: at,
        },
      }),
    ]);
  }

  /** Reprise après une suspension : le relais a vu ce qui se passait sur le poste. */
  async resume(actor: RelaisActor, id: string): Promise<void> {
    const at = now();
    await this.currentSession(actor, id);
    await this.prisma.$transaction([
      this.prisma.classSession.update({
        where: { id },
        data: { failedAttempts: 0, suspendedAt: null },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "session.resume",
          entityType: "ClassSession",
          entityId: id,
          createdAt: at,
        },
      }),
    ]);
  }

  private async currentSession(actor: RelaisActor, id: string): Promise<void> {
    await this.closeExpired(now(), actor.relaisId);
    const session = await this.prisma.classSession.findFirst({
      where: { id, relaisId: actor.relaisId },
      select: { status: true },
    });
    if (!session) {
      throw NOT_FOUND();
    }
    if (session.status !== "OPEN") {
      throw new AppError(409, NOT_OPEN);
    }
  }

  /**
   * Ferme les sessions arrivées à leur fin, à chaque action du relais, avec leur heure de fin
   * réelle. Pas de tâche planifiée : l'accès des enfants s'arrête de toute façon à `endsAt`, dès
   * leur requête suivante, et une tâche sur une autre horloge (instance de développement à l'heure
   * réelle, tests à horloge figée) fermerait des sessions encore valables.
   */
  async closeExpired(at: Date = now(), relaisId?: string): Promise<number> {
    const expired = await this.prisma.classSession.findMany({
      where: { status: "OPEN", endsAt: { lte: at }, ...(relaisId ? { relaisId } : {}) },
      select: { id: true, endsAt: true },
    });
    let closed = 0;
    for (const session of expired) {
      const { count } = await this.prisma.classSession.updateMany({
        where: { id: session.id, status: "OPEN" },
        data: { status: "CLOSED", closedAt: session.endsAt },
      });
      if (count > 0) {
        closed += 1;
        await this.prisma.auditLog.create({
          data: {
            action: "session.expire",
            entityType: "ClassSession",
            entityId: session.id,
            createdAt: at,
          },
        });
      }
    }
    return closed;
  }
}
