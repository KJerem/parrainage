import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ageAt,
  avatarTones,
  type AvatarTone,
  type ChildCode,
  type ChildCodeProposal,
  type ChildCodeReset,
  type ChildFields,
  childSubmissionIssues,
  CONSENT_TEXT_VERSION,
  type CreateSchool,
  type RelaisChildDetail,
  type RelaisChildList,
  type RelaisChildRow,
  type RelaisHome,
  type SaveChild,
  type SaveChildResult,
  type School,
  type SchoolList,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ConsentType } from "../generated/prisma/enums.js";
import { childSubmittedEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { attachableMediaWhere, INVALID_MEDIA_MESSAGE, removeStoredFiles } from "../media/attach.js";
import { listedMediaWhere, mediaRefSelect, toMediaRef } from "../media/media-ref.js";
import type { Actor } from "../auth/actor.js";
import { MessagingService } from "../messaging/messaging.service.js";
import { childName, ofName, tone } from "../messaging/present.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { hashChildCode, randomChildCode, readChildCodeToken, signChildCode } from "./child-code.js";
import {
  byFrenchName,
  currentPeriod,
  FOLLOWED_STATUSES,
  lastNewsAtOf,
  lastNewsSelect,
  NOT_FOUND,
  type RelaisActor,
  schoolYearPeriods,
} from "./relais-common.js";

const MIN_AGE = 3;
const MAX_AGE = 25;

const CHILD_TONES = avatarTones.filter((value) => value !== "white" && value !== "dark");

/** Teinte stable d'un nouvel enfant, tirée de son prénom. */
function toneFor(firstName: string): AvatarTone {
  const sum = [...firstName].reduce((total, char) => total + char.charCodeAt(0), 0);
  return CHILD_TONES[sum % CHILD_TONES.length] ?? "brand";
}

function rowSelect(at: Date) {
  return {
    id: true,
    firstName: true,
    lastInitial: true,
    birthDate: true,
    className: true,
    fileStatus: true,
    consentMedia: true,
    school: { select: { shortName: true } },
    sponsorships: {
      where: { status: "ACTIVE" },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      select: { parrainId: true, parrain: { select: { displayName: true } } },
    },
    ...lastNewsSelect(at),
  } as const satisfies Prisma.ChildSelect;
}

type ChildRow = Prisma.ChildGetPayload<{ select: ReturnType<typeof rowSelect> }>;

const detailSelect = {
  id: true,
  firstName: true,
  lastInitial: true,
  gender: true,
  birthDate: true,
  district: true,
  schoolId: true,
  className: true,
  schoolYear: true,
  teacherName: true,
  guardianName: true,
  guardianPhone: true,
  consentSponsorship: true,
  consentMedia: true,
  fileStatus: true,
  avatarTone: true,
  codeHash: true,
  photo: { select: mediaRefSelect },
  consentDocument: { select: mediaRefSelect },
  sponsorships: {
    where: { status: "ACTIVE" },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    select: { parrain: { select: { displayName: true } } },
  },
} as const satisfies Prisma.ChildSelect;

type DetailRow = Prisma.ChildGetPayload<{ select: typeof detailSelect }>;

const isListed = (media: { status: string }) =>
  (listedMediaWhere.status.in as readonly string[]).includes(media.status);

function toRow(row: ChildRow, at: Date): RelaisChildRow {
  return {
    id: row.id,
    name: childName(row),
    age: ageAt(row.birthDate, at),
    className: row.className,
    schoolName: row.school?.shortName ?? null,
    parrains: row.sponsorships
      .map((s) => s.parrain.displayName)
      .sort((a, b) => a.localeCompare(b, "fr")),
    parrainIds: row.sponsorships.map((s) => s.parrainId),
    fileStatus: row.fileStatus,
    lastNewsAt: lastNewsAtOf(row)?.toISOString() ?? null,
    consentMedia: row.consentMedia,
  };
}

function toDetail(row: DetailRow, at: Date): RelaisChildDetail {
  return {
    id: row.id,
    firstName: row.firstName,
    lastInitial: row.lastInitial,
    gender: row.gender,
    birthDate: row.birthDate.toISOString().slice(0, 10),
    district: row.district,
    schoolId: row.schoolId,
    className: row.className,
    schoolYear: row.schoolYear,
    teacherName: row.teacherName ?? "",
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    consentSponsorship: row.consentSponsorship,
    consentMedia: row.consentMedia,
    fileStatus: row.fileStatus,
    avatarTone: tone(row.avatarTone, "brand"),
    photo: row.photo && isListed(row.photo) ? toMediaRef(row.photo) : null,
    consentDocument:
      row.consentDocument && isListed(row.consentDocument) ? toMediaRef(row.consentDocument) : null,
    hasCode: row.codeHash !== null,
    parrains: row.sponsorships.map((s) => s.parrain.displayName),
    now: at.toISOString(),
  };
}

/** Fiche des enfants d'un relais : jamais d'accès à l'enfant d'un autre relais (404). */
@Injectable()
export class ChildrenService {
  private readonly logger = new Logger(ChildrenService.name);
  private readonly pepper: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly messaging: MessagingService,
    config: ConfigService<Env, true>,
  ) {
    this.pepper = config.get("CHILD_CODE_PEPPER", { infer: true });
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  async list(actor: RelaisActor): Promise<RelaisChildList> {
    const at = now();
    return { items: await this.rows(actor, at), now: at.toISOString() };
  }

  async home(actor: RelaisActor, fullActor: Actor): Promise<RelaisHome> {
    const at = now();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const startOfToday = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    const [children, newsThisMonth, unread, periods, nextSession, callRequests] = await Promise.all(
      [
        this.rows(actor, at),
        this.prisma.newsPost.count({
          where: {
            relaisId: actor.relaisId,
            status: "PUBLISHED",
            publishedAt: { gte: monthStart, lte: at },
          },
        }),
        this.messaging.unreadTotal(fullActor),
        schoolYearPeriods(this.prisma, at),
        this.prisma.classSession.findFirst({
          where: {
            relaisId: actor.relaisId,
            status: "PLANNED",
            scheduledAt: { gte: startOfToday },
          },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, scheduledAt: true, _count: { select: { children: true } } },
        }),
        this.prisma.callRequest.findMany({
          where: { relaisId: actor.relaisId, status: "REQUESTED" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            conversationId: true,
            sponsorship: {
              select: {
                parrain: { select: { displayName: true } },
                child: { select: { firstName: true, lastInitial: true } },
              },
            },
          },
        }),
      ],
    );
    const followed = children.filter((child) => FOLLOWED_STATUSES.includes(child.fileStatus));
    const period = currentPeriod(periods, at);
    const entered = period
      ? await this.prisma.schoolResult.count({
          where: {
            periodId: period.id,
            status: { in: ["DRAFT", "SENT"] },
            child: { relaisId: actor.relaisId, fileStatus: { in: [...FOLLOWED_STATUSES] } },
          },
        })
      : 0;
    return {
      stats: {
        childCount: followed.length,
        newsThisMonth,
        unreadMessages: unread.total,
        bulletinsToEnter: period ? followed.length - entered : 0,
      },
      bulletinsDue: period
        ? {
            term: period.kind === "ANNUAL" ? "bilan annuel" : period.kind,
            label: period.label,
            dueDate: period.dueDate?.toISOString().slice(0, 10) ?? null,
          }
        : null,
      draftCount: children.filter((child) => child.fileStatus === "DRAFT").length,
      callRequests: callRequests.map((request) => ({
        id: request.id,
        parrainName: request.sponsorship.parrain.displayName,
        childName: `${request.sponsorship.child.firstName} ${request.sponsorship.child.lastInitial}.`,
        conversationId: request.conversationId,
      })),
      nextSession: nextSession?.scheduledAt
        ? {
            id: nextSession.id,
            scheduledAt: nextSession.scheduledAt.toISOString(),
            childCount: nextSession._count.children,
          }
        : null,
      children,
      now: at.toISOString(),
    };
  }

  async detail(actor: RelaisActor, id: string): Promise<RelaisChildDetail> {
    const at = now();
    return toDetail(await this.findDetail(actor, id), at);
  }

  async create(actor: RelaisActor, input: SaveChild): Promise<SaveChildResult> {
    const at = now();
    const fields = this.withoutAction(input);
    this.checkBirthDate(fields, at);
    const submitting = input.action === "submit";
    if (submitting) {
      this.checkComplete(fields);
    }
    await this.checkSchool(actor, fields.schoolId);
    await this.checkMedia(actor, [fields.photoMediaId, fields.consentDocumentId]);
    const code = submitting ? this.codeFrom(input.codeToken, at) : null;
    const codeHash = code ? await hashChildCode(code, this.pepper) : null;

    const row = await this.prisma.$transaction(async (tx) => {
      const { id } = await tx.child.create({
        data: {
          ...this.columns(fields),
          relaisId: actor.relaisId,
          createdById: actor.userId,
          avatarTone: toneFor(fields.firstName),
          fileStatus: submitting ? "SUBMITTED" : "DRAFT",
          submittedAt: submitting ? at : null,
          codeHash,
          codeSetAt: code ? at : null,
          consentDocumentId: fields.consentDocumentId,
          photoMediaId: fields.photoMediaId,
        },
        select: { id: true },
      });
      await this.markAttachments(tx, fields);
      await this.recordConsents(tx, actor, id, { sponsorship: false, media: false }, fields, at);
      await this.audit(tx, actor, id, submitting ? "child.submit" : "child.create", at);
      return tx.child.findUniqueOrThrow({ where: { id }, select: detailSelect });
    });
    if (submitting) {
      await this.notifyBureau(row.id);
    }
    return { child: toDetail(row, at), code };
  }

  async update(actor: RelaisActor, id: string, input: SaveChild): Promise<SaveChildResult> {
    const at = now();
    const current = await this.findDetail(actor, id);
    const fields = this.withoutAction(input);
    this.checkBirthDate(fields, at);
    // Un dossier envoyé reste complet, même modifié plus tard.
    const submitting = current.fileStatus === "DRAFT" && input.action === "submit";
    if (submitting || current.fileStatus !== "DRAFT") {
      this.checkComplete(fields);
    }
    await this.checkSchool(actor, fields.schoolId);
    const photoId = current.photo?.id ?? null;
    const documentId = current.consentDocument?.id ?? null;
    const newPhoto = fields.photoMediaId !== photoId ? fields.photoMediaId : null;
    const newDocument = fields.consentDocumentId !== documentId ? fields.consentDocumentId : null;
    await this.checkMedia(actor, [newPhoto, newDocument]);
    const code =
      submitting && current.codeHash === null ? this.codeFrom(input.codeToken, at) : null;
    const codeHash = code ? await hashChildCode(code, this.pepper) : null;
    const replaced = [
      fields.photoMediaId !== photoId ? photoId : null,
      fields.consentDocumentId !== documentId ? documentId : null,
    ].filter((value): value is string => value !== null);

    const { row, dropped } = await this.prisma.$transaction(async (tx) => {
      await tx.child.update({
        where: { id },
        data: {
          ...this.columns(fields),
          photoMediaId: fields.photoMediaId,
          consentDocumentId: fields.consentDocumentId,
          ...(submitting ? { fileStatus: "SUBMITTED", submittedAt: at } : {}),
          ...(codeHash ? { codeHash, codeSetAt: at } : {}),
        },
      });
      await this.markAttachments(tx, {
        photoMediaId: newPhoto,
        consentDocumentId: newDocument,
        firstName: fields.firstName,
      });
      const dropped = await tx.media.findMany({
        where: { id: { in: replaced } },
        select: { id: true, storageKey: true },
      });
      // Refusés plutôt que supprimés : la purge réessaiera si le stockage est indisponible.
      await tx.media.updateMany({
        where: { id: { in: replaced } },
        data: { status: "REJECTED", kind: "PHOTO" },
      });
      await this.recordConsents(
        tx,
        actor,
        id,
        { sponsorship: current.consentSponsorship, media: current.consentMedia },
        fields,
        at,
      );
      await this.audit(tx, actor, id, submitting ? "child.submit" : "child.update", at);
      return {
        row: await tx.child.findUniqueOrThrow({ where: { id }, select: detailSelect }),
        dropped,
      };
    });
    await removeStoredFiles(this.prisma, this.storage, this.logger, dropped);
    if (submitting) {
      await this.notifyBureau(row.id);
    }
    return { child: toDetail(row, at), code };
  }

  proposeCode(): ChildCodeProposal {
    const images = randomChildCode();
    return { images, token: signChildCode(images, this.pepper, now()) };
  }

  /** Nouveau code d'un dossier envoyé : l'ancien ne marche plus, le nouveau se voit une fois. */
  async resetCode(actor: RelaisActor, id: string): Promise<ChildCodeReset> {
    const at = now();
    const child = await this.findDetail(actor, id);
    if (child.fileStatus === "DRAFT") {
      throw new AppError(409, "Le code est attribué à l'envoi du dossier au bureau");
    }
    const images = randomChildCode();
    const codeHash = await hashChildCode(images, this.pepper);
    await this.prisma.$transaction(async (tx) => {
      // Un nouveau code lève aussi le verrou : l'enfant repart avec tous ses essais.
      await tx.child.update({
        where: { id },
        data: { codeHash, codeSetAt: at, failedCodeAttempts: 0, codeLockedAt: null },
      });
      await this.audit(tx, actor, id, "child.code_reset", at);
    });
    return { images };
  }

  async schools(actor: RelaisActor): Promise<SchoolList> {
    const items = await this.prisma.school.findMany({
      where: { relaisId: actor.relaisId },
      orderBy: { shortName: "asc" },
      select: { id: true, shortName: true, fullName: true, city: true, level: true },
    });
    return { items };
  }

  async createSchool(actor: RelaisActor, input: CreateSchool): Promise<School> {
    const relais = await this.prisma.relais.findUniqueOrThrow({
      where: { id: actor.relaisId },
      select: { city: true },
    });
    try {
      return await this.prisma.school.create({
        data: {
          relaisId: actor.relaisId,
          shortName: input.shortName,
          fullName: input.fullName || input.shortName,
          city: input.city || relais.city,
          level: input.level,
        },
        select: { id: true, shortName: true, fullName: true, city: true, level: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const issue = "Cette école existe déjà dans votre liste";
        throw new AppError(409, issue, { shortName: [issue] });
      }
      throw error;
    }
  }

  private async rows(actor: RelaisActor, at: Date): Promise<RelaisChildRow[]> {
    const rows = await this.prisma.child.findMany({
      where: { relaisId: actor.relaisId, fileStatus: { not: "ARCHIVED" } },
      select: rowSelect(at),
    });
    return rows.map((row) => toRow(row, at)).sort(byFrenchName);
  }

  private async findDetail(actor: RelaisActor, id: string): Promise<DetailRow> {
    const row = await this.prisma.child.findFirst({
      where: { id, relaisId: actor.relaisId, fileStatus: { not: "ARCHIVED" } },
      select: detailSelect,
    });
    if (!row) {
      throw NOT_FOUND();
    }
    return row;
  }

  private withoutAction(input: SaveChild): ChildFields {
    const { action: _action, codeToken: _codeToken, ...fields } = input;
    return fields;
  }

  private columns(fields: ChildFields) {
    return {
      firstName: fields.firstName,
      lastInitial: fields.lastInitial,
      gender: fields.gender,
      birthDate: new Date(`${fields.birthDate}T00:00:00Z`),
      district: fields.district,
      schoolId: fields.schoolId,
      className: fields.className,
      schoolYear: fields.schoolYear,
      teacherName: fields.teacherName === "" ? null : fields.teacherName,
      guardianName: fields.guardianName,
      guardianPhone: fields.guardianPhone,
      consentSponsorship: fields.consentSponsorship,
      consentMedia: fields.consentMedia,
    };
  }

  private checkBirthDate(fields: ChildFields, at: Date): void {
    const birth = new Date(`${fields.birthDate}T00:00:00Z`);
    const age = birth.getTime() > at.getTime() ? -1 : ageAt(birth, at);
    if (age < MIN_AGE || age > MAX_AGE) {
      const issue = "Cette date de naissance ne semble pas correcte";
      throw new AppError(422, issue, { birthDate: [issue] });
    }
  }

  private checkComplete(fields: ChildFields): void {
    const issues = childSubmissionIssues(fields);
    const [first] = Object.values(issues);
    if (first?.[0]) {
      throw new AppError(422, "Complétez le dossier avant de l'envoyer au bureau", issues);
    }
  }

  private async checkSchool(actor: RelaisActor, schoolId: string | null): Promise<void> {
    if (schoolId === null) {
      return;
    }
    const school = await this.prisma.school.count({
      where: { id: schoolId, relaisId: actor.relaisId },
    });
    if (school === 0) {
      const issue = "Choisissez une école de votre relais";
      throw new AppError(422, issue, { schoolId: [issue] });
    }
  }

  private async checkMedia(actor: RelaisActor, ids: readonly (string | null)[]): Promise<void> {
    const wanted = ids.filter((value): value is string => value !== null);
    if (wanted.length === 0) {
      return;
    }
    const usable = await this.prisma.media.count({
      where: attachableMediaWhere(actor.userId, wanted),
    });
    if (usable !== new Set(wanted).size || new Set(wanted).size !== wanted.length) {
      throw new AppError(422, INVALID_MEDIA_MESSAGE);
    }
  }

  private codeFrom(token: string | null, at: Date): ChildCode {
    return (token ? readChildCodeToken(token, this.pepper, at) : null) ?? randomChildCode();
  }

  private async markAttachments(
    tx: Prisma.TransactionClient,
    fields: Pick<ChildFields, "photoMediaId" | "consentDocumentId" | "firstName">,
  ): Promise<void> {
    if (fields.photoMediaId) {
      await tx.media.update({
        where: { id: fields.photoMediaId },
        data: { kind: "AVATAR", label: `Photo ${ofName(fields.firstName)}` },
      });
    }
    if (fields.consentDocumentId) {
      await tx.media.update({
        where: { id: fields.consentDocumentId },
        data: { kind: "CONSENT", label: "Autorisation signée" },
      });
    }
  }

  /** Trace chaque accord donné ou retiré, avec la version du texte et qui l'a recueilli. */
  private async recordConsents(
    tx: Prisma.TransactionClient,
    actor: RelaisActor,
    childId: string,
    before: { sponsorship: boolean; media: boolean },
    fields: Pick<ChildFields, "consentSponsorship" | "consentMedia">,
    at: Date,
  ): Promise<void> {
    const changes: { type: ConsentType; was: boolean; granted: boolean }[] = [
      { type: "SPONSORSHIP", was: before.sponsorship, granted: fields.consentSponsorship },
      { type: "MEDIA", was: before.media, granted: fields.consentMedia },
    ];
    for (const { type, was, granted } of changes) {
      if (was === granted) {
        continue;
      }
      if (granted) {
        await tx.consentRecord.create({
          data: {
            childId,
            type,
            textVersion: CONSENT_TEXT_VERSION,
            recordedById: actor.userId,
            grantedAt: at,
          },
        });
      } else {
        await tx.consentRecord.updateMany({
          where: { childId, type, withdrawnAt: null },
          data: { withdrawnAt: at },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "child.consent",
          entityType: "Child",
          entityId: childId,
          metadata: { type, granted },
          createdAt: at,
        },
      });
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: RelaisActor,
    childId: string,
    action: string,
    at: Date,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action,
        entityType: "Child",
        entityId: childId,
        createdAt: at,
      },
    });
  }

  /** Le bureau vérifie les dossiers envoyés : un lien vers le dossier, aucune donnée de l'enfant. */
  private async notifyBureau(childId: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { role: "bureau", OR: [{ banned: null }, { banned: false }] },
      select: { email: true },
    });
    const url = new URL(`/bureau/enfants/${encodeURIComponent(childId)}`, this.appUrl).toString();
    for (const user of users) {
      sendMailInBackground({ to: user.email, ...childSubmittedEmail(url) });
    }
  }
}
