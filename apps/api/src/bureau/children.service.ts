import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ageAt,
  avatarToneSchema,
  type BureauChild,
  bureauChildSchema,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import { childValidatedEmail } from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { mediaRefSelect, toMediaRef } from "../media/media-ref.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { lastNewsAtOf, lastNewsSelect } from "../relais/relais-common.js";
import type { BureauActor } from "./sponsorships.service.js";

/** Dossier d'un enfant vu par le bureau (/bureau/enfants/:id) et sa validation. */
@Injectable()
export class BureauChildrenService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  /** Un brouillon reste au relais : le bureau ne voit que les dossiers envoyés. */
  async dossier(id: string): Promise<BureauChild> {
    const at = now();
    const child = await this.prisma.child.findFirst({
      where: { id, fileStatus: { not: "DRAFT" } },
      select: {
        id: true,
        firstName: true,
        lastInitial: true,
        gender: true,
        birthDate: true,
        className: true,
        schoolYear: true,
        district: true,
        avatarTone: true,
        guardianName: true,
        guardianPhone: true,
        consentSponsorship: true,
        consentMedia: true,
        fileStatus: true,
        submittedAt: true,
        validatedAt: true,
        school: { select: { fullName: true } },
        relais: { select: { id: true, displayName: true, city: true } },
        photo: { select: mediaRefSelect },
        consentDocument: { select: mediaRefSelect },
        sponsorships: {
          where: { status: "ACTIVE" },
          orderBy: [{ startDate: "asc" }, { id: "asc" }],
          select: {
            id: true,
            startDate: true,
            monthlyAmountCents: true,
            parrain: { select: { id: true, displayName: true } },
          },
        },
        ...lastNewsSelect(at),
      },
    });
    if (!child) {
      throw new NotFoundException();
    }
    const shown = (media: typeof child.photo) =>
      media && (media.status === "READY" || media.status === "PLACEHOLDER")
        ? toMediaRef(media)
        : null;
    return bureauChildSchema.parse({
      now: at.toISOString(),
      id: child.id,
      firstName: child.firstName,
      lastInitial: child.lastInitial,
      gender: child.gender,
      birthDate: child.birthDate.toISOString().slice(0, 10),
      age: ageAt(child.birthDate, at),
      className: child.className,
      schoolYear: child.schoolYear,
      schoolName: child.school?.fullName ?? null,
      district: child.district,
      avatarTone: avatarToneSchema.catch("neutral").parse(child.avatarTone),
      photo: shown(child.photo),
      relais: child.relais,
      addedBy: child.relais.displayName,
      guardianName: child.guardianName,
      guardianPhone: child.guardianPhone,
      consentSponsorship: child.consentSponsorship,
      consentMedia: child.consentMedia,
      consentDocument: shown(child.consentDocument),
      fileStatus: child.fileStatus,
      submittedAt: child.submittedAt?.toISOString() ?? null,
      validatedAt: child.validatedAt?.toISOString() ?? null,
      lastNewsAt: lastNewsAtOf(child)?.toISOString() ?? null,
      sponsorships: child.sponsorships.map((s) => ({
        id: s.id,
        parrain: s.parrain,
        startDate: s.startDate.toISOString().slice(0, 10),
        monthlyAmountCents: s.monthlyAmountCents,
      })),
    });
  }

  /** Dossier envoyé → validé (une seule fois), audité ; le relais est prévenu par un lien. */
  async validate(actor: BureauActor, id: string): Promise<BureauChild> {
    const at = now();
    const child = await this.prisma.child.findFirst({
      where: { id, fileStatus: { not: "DRAFT" } },
      select: { id: true, fileStatus: true, relais: { select: { userId: true } } },
    });
    if (!child) {
      throw new NotFoundException();
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.child.updateMany({
        where: { id, fileStatus: "SUBMITTED" },
        data: { fileStatus: "VALIDATED", validatedAt: at },
      });
      if (count === 1) {
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: "child.validate",
            entityType: "Child",
            entityId: id,
          },
        });
      }
      return count === 1;
    });
    if (!updated) {
      throw new AppError(
        409,
        child.fileStatus === "VALIDATED"
          ? "Ce dossier est déjà validé"
          : "Ce dossier ne peut plus être validé",
      );
    }
    const relaisUser = await this.prisma.user.findFirst({
      where: { id: child.relais.userId, OR: [{ banned: null }, { banned: false }] },
      select: { email: true },
    });
    if (relaisUser) {
      const url = new URL(`/relais/enfants/${encodeURIComponent(id)}`, this.appUrl).toString();
      sendMailInBackground({ to: relaisUser.email, ...childValidatedEmail(url) });
    }
    return this.dossier(id);
  }
}
