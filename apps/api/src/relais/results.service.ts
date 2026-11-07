import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AllowChildUpload,
  AllowChildUploadResult,
  RelaisResults,
  RelaisResultsQuery,
  ResultRow,
  SaveResult,
  SendResultsResult,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import { Prisma } from "../generated/prisma/client.js";
import { resultsSentEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { attachableMediaWhere, INVALID_MEDIA_MESSAGE, removeStoredFiles } from "../media/attach.js";
import { listedMedia, mediaRefSelect, toMediaRef } from "../media/media-ref.js";
import { childName } from "../messaging/present.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import {
  type AcademicPeriodRow,
  byFrenchName,
  currentPeriod,
  FOLLOWED_STATUSES,
  NOT_FOUND,
  type RelaisActor,
  schoolYearPeriods,
  shortSchoolYear,
} from "./relais-common.js";

/** Pages de bulletin jointes à un résultat. */
const MAX_BULLETIN_PAGES = 4;

const STALE_MESSAGE = "Une saisie plus récente a déjà été enregistrée pour cet enfant";

const resultSelect = {
  className: true,
  averageX100: true,
  rank: true,
  classSize: true,
  appreciation: true,
  status: true,
  allowChildUpload: true,
  clientUpdatedAt: true,
  media: {
    ...listedMedia,
    where: { ...listedMedia.where, kind: "BULLETIN" },
    select: { ...mediaRefSelect, messageId: true, uploadedByUserId: true },
  },
} as const satisfies Prisma.SchoolResultSelect;

type ResultColumns = Prisma.SchoolResultGetPayload<{ select: typeof resultSelect }>;

function toRow(
  child: { id: string; firstName: string; lastInitial: string; className: string },
  result: ResultColumns | undefined,
): ResultRow {
  return {
    childId: child.id,
    name: childName(child),
    className: result?.className ?? child.className,
    averageX100: result?.averageX100 ?? null,
    rank: result?.rank ?? null,
    classSize: result?.classSize ?? null,
    appreciation: result?.appreciation ?? null,
    status: result?.status ?? "TO_ENTER",
    allowChildUpload: result?.allowChildUpload ?? false,
    bulletins: result?.media.map(toMediaRef) ?? [],
    // Une page du seed, ou aussi jointe à un message, ne se retire pas d'ici.
    removableBulletinIds:
      result?.media.filter((m) => m.messageId === null && m.uploadedByUserId).map((m) => m.id) ??
      [],
    clientUpdatedAt: result?.clientUpdatedAt?.toISOString() ?? null,
  };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « 1er trimestre 2026-27 » */
const periodLabel = (period: AcademicPeriodRow) =>
  `${capitalize(period.label)} ${shortSchoolYear(period.schoolYear)}`;

/** « Bulletin T1 — 2026-27 », « Bulletin annuel — 2026-27 ». */
const bulletinLabel = (period: AcademicPeriodRow) =>
  `Bulletin ${period.kind === "ANNUAL" ? "annuel" : period.kind} — ${shortSchoolYear(period.schoolYear)}`;

/**
 * Saisie groupée des résultats : sauvegarde automatique ligne à ligne, une donnée plus ancienne
 * que l'enregistrée est refusée (409), et seul « Envoyer » rend un résultat visible aux parrains.
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  async sheet(actor: RelaisActor, query: RelaisResultsQuery): Promise<RelaisResults> {
    const at = now();
    const [periods, schools] = await Promise.all([
      schoolYearPeriods(this.prisma, at),
      this.prisma.school.findMany({
        where: {
          relaisId: actor.relaisId,
          children: { some: { fileStatus: { in: [...FOLLOWED_STATUSES] } } },
        },
        orderBy: { shortName: "asc" },
        select: {
          id: true,
          shortName: true,
          _count: {
            select: { children: { where: { fileStatus: { in: [...FOLLOWED_STATUSES] } } } },
          },
        },
      }),
    ]);
    const period = periods.find((p) => p.id === query.periode) ?? currentPeriod(periods, at);
    // Sans choix : l'école qui a le plus d'enfants, pour que la page serve dès l'ouverture.
    const largest = [...schools].sort((a, b) => b._count.children - a._count.children)[0];
    const school = schools.find((s) => s.id === query.ecole) ?? largest;
    const rows =
      period && school
        ? await this.prisma.child.findMany({
            where: {
              relaisId: actor.relaisId,
              schoolId: school.id,
              fileStatus: { in: [...FOLLOWED_STATUSES] },
            },
            select: {
              id: true,
              firstName: true,
              lastInitial: true,
              className: true,
              results: { where: { periodId: period.id }, select: resultSelect },
            },
          })
        : [];
    return {
      periods: periods.map((p) => ({ id: p.id, label: periodLabel(p) })),
      periodId: period?.id ?? null,
      schools: schools.map((s) => ({
        id: s.id,
        shortName: s.shortName,
        childCount: s._count.children,
      })),
      schoolId: school?.id ?? null,
      rows: rows.map((child) => toRow(child, child.results[0])).sort(byFrenchName),
      now: at.toISOString(),
    };
  }

  async save(
    actor: RelaisActor,
    periodId: string,
    childId: string,
    input: SaveResult,
  ): Promise<ResultRow> {
    const child = await this.findChild(actor, childId);
    await this.findPeriod(periodId);
    const clientUpdatedAt = new Date(input.clientUpdatedAt);
    const existing = await this.prisma.schoolResult.findUnique({
      where: { childId_periodId: { childId, periodId } },
      select: { status: true, clientUpdatedAt: true },
    });
    if (existing?.clientUpdatedAt && existing.clientUpdatedAt > clientUpdatedAt) {
      throw new AppError(409, STALE_MESSAGE);
    }
    if (existing?.status === "SENT" && input.averageX100 === null) {
      const issue = "Un résultat déjà envoyé doit garder sa moyenne";
      throw new AppError(422, issue, { averageX100: [issue] });
    }
    const hasData =
      input.averageX100 !== null ||
      input.rank !== null ||
      input.classSize !== null ||
      input.appreciation !== null;
    const columns = {
      averageX100: input.averageX100,
      rank: input.rank,
      classSize: input.classSize,
      appreciation: input.appreciation,
      enteredById: actor.userId,
      clientUpdatedAt,
      status:
        existing?.status === "SENT"
          ? ("SENT" as const)
          : hasData
            ? ("DRAFT" as const)
            : ("TO_ENTER" as const),
    };
    if (existing) {
      // La condition protège d'une saisie plus récente arrivée entre la lecture et l'écriture.
      const { count } = await this.prisma.schoolResult.updateMany({
        where: {
          childId,
          periodId,
          OR: [{ clientUpdatedAt: null }, { clientUpdatedAt: { lte: clientUpdatedAt } }],
        },
        data: columns,
      });
      if (count === 0) {
        throw new AppError(409, STALE_MESSAGE);
      }
    } else {
      await this.prisma.schoolResult
        .create({ data: { ...columns, childId, periodId, className: child.className } })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new AppError(409, STALE_MESSAGE);
          }
          throw error;
        });
    }
    return this.row(childId, periodId);
  }

  async attachBulletin(
    actor: RelaisActor,
    periodId: string,
    childId: string,
    mediaId: string,
  ): Promise<ResultRow> {
    const child = await this.findChild(actor, childId);
    const period = await this.findPeriod(periodId);
    const existing = await this.prisma.schoolResult.findUnique({
      where: { childId_periodId: { childId, periodId } },
      select: { _count: { select: { media: { where: { status: { not: "REJECTED" } } } } } },
    });
    if ((existing?._count.media ?? 0) >= MAX_BULLETIN_PAGES) {
      throw new AppError(422, `${MAX_BULLETIN_PAGES} pages au plus pour un bulletin`);
    }
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.schoolResult.upsert({
        where: { childId_periodId: { childId, periodId } },
        create: {
          childId,
          periodId,
          className: child.className,
          status: "DRAFT",
          enteredById: actor.userId,
        },
        // Un bulletin joint vaut saisie commencée ; un résultat envoyé le reste.
        update: { enteredById: actor.userId },
        select: { id: true, status: true },
      });
      if (result.status === "TO_ENTER") {
        await tx.schoolResult.update({ where: { id: result.id }, data: { status: "DRAFT" } });
      }
      const { count } = await tx.media.updateMany({
        where: attachableMediaWhere(actor.userId, [mediaId]),
        data: {
          schoolResultId: result.id,
          kind: "BULLETIN",
          label: bulletinLabel(period),
          position: existing?._count.media ?? 0,
        },
      });
      if (count !== 1) {
        throw new AppError(422, INVALID_MEDIA_MESSAGE);
      }
    });
    return this.row(childId, periodId);
  }

  /** Retire une page jointe par le relais ; un bulletin joint à un message n'en est pas retiré. */
  async removeBulletin(
    actor: RelaisActor,
    periodId: string,
    childId: string,
    mediaId: string,
  ): Promise<ResultRow> {
    await this.findChild(actor, childId);
    const media = await this.prisma.media.findFirst({
      where: {
        id: mediaId,
        messageId: null,
        uploadedByUserId: actor.userId,
        schoolResult: { childId, periodId },
      },
      select: { id: true, storageKey: true },
    });
    if (!media) {
      throw new AppError(404, "Cette page de bulletin n'existe plus");
    }
    await this.prisma.media.update({
      where: { id: media.id },
      data: { status: "REJECTED", schoolResultId: null, kind: "PHOTO" },
    });
    await removeStoredFiles(this.prisma, this.storage, this.logger, [media]);
    return this.row(childId, periodId);
  }

  /** Envoie aux parrains les brouillons de l'école qui ont une moyenne. */
  async send(actor: RelaisActor, periodId: string, schoolId: string): Promise<SendResultsResult> {
    await this.findPeriod(periodId);
    const at = now();
    const ready = await this.prisma.schoolResult.findMany({
      where: {
        periodId,
        status: "DRAFT",
        averageX100: { not: null },
        child: {
          relaisId: actor.relaisId,
          schoolId,
          fileStatus: { in: [...FOLLOWED_STATUSES] },
        },
      },
      select: { id: true, childId: true },
    });
    if (ready.length === 0) {
      return { sent: 0 };
    }
    const { count } = await this.prisma.schoolResult.updateMany({
      where: { id: { in: ready.map((r) => r.id) }, status: "DRAFT" },
      data: { status: "SENT", sentAt: at },
    });
    const users = await this.prisma.user.findMany({
      where: {
        OR: [{ banned: null }, { banned: false }],
        parrainProfile: {
          sponsorships: {
            some: { status: "ACTIVE", childId: { in: ready.map((r) => r.childId) } },
          },
        },
      },
      select: { email: true },
    });
    const url = new URL("/parrain", this.appUrl).toString();
    for (const user of users) {
      sendMailInBackground({ to: user.email, ...resultsSentEmail(url) });
    }
    return { sent: count };
  }

  /** « Laisser l'enfant envoyer son bulletin » : pour les enfants de l'école qui n'en ont pas. */
  async allowChildUpload(
    actor: RelaisActor,
    periodId: string,
    input: AllowChildUpload,
  ): Promise<AllowChildUploadResult> {
    await this.findPeriod(periodId);
    const children = await this.prisma.child.findMany({
      where: {
        relaisId: actor.relaisId,
        schoolId: input.schoolId,
        fileStatus: { in: [...FOLLOWED_STATUSES] },
        NOT: { results: { some: { periodId, media: { some: { kind: "BULLETIN" } } } } },
      },
      select: { id: true, className: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.schoolResult.createMany({
        data: children.map((child) => ({
          childId: child.id,
          periodId,
          className: child.className,
        })),
        skipDuplicates: true,
      });
      await tx.schoolResult.updateMany({
        where: { periodId, childId: { in: children.map((child) => child.id) } },
        data: { allowChildUpload: input.allowed },
      });
    });
    return { count: children.length };
  }

  private async findChild(actor: RelaisActor, childId: string) {
    const child = await this.prisma.child.findFirst({
      where: { id: childId, relaisId: actor.relaisId, fileStatus: { in: [...FOLLOWED_STATUSES] } },
      select: { id: true, firstName: true, lastInitial: true, className: true },
    });
    if (!child) {
      throw NOT_FOUND();
    }
    return child;
  }

  private async findPeriod(periodId: string): Promise<AcademicPeriodRow> {
    const period = await this.prisma.academicPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, kind: true, label: true, schoolYear: true, dueDate: true },
    });
    if (!period) {
      throw new AppError(404, "Cette période n'existe pas");
    }
    return period;
  }

  private async row(childId: string, periodId: string): Promise<ResultRow> {
    const child = await this.prisma.child.findUniqueOrThrow({
      where: { id: childId },
      select: {
        id: true,
        firstName: true,
        lastInitial: true,
        className: true,
        results: { where: { periodId }, select: resultSelect },
      },
    });
    return toRow(child, child.results[0]);
  }
}
