import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type BureauParrain,
  bureauParrainSchema,
  type BureauParrains,
  bureauParrainsSchema,
  type InviteParrain,
} from "@parrainage/contracts";
import { auth, INVITATION_METADATA } from "../auth/auth.js";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { initialOf, parrainStatus } from "./health.js";
import type { BureauActor } from "./sponsorships.service.js";

const collator = new Intl.Collator("fr");

const parrainSelect = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  lastInitial: true,
  gender: true,
  city: true,
  country: true,
  wishes: true,
  joinedAt: true,
  lastActiveAt: true,
  user: { select: { email: true } },
  sponsorships: {
    where: { status: "ACTIVE" },
    orderBy: { startDate: "asc" },
    select: {
      monthlyAmountCents: true,
      child: { select: { firstName: true, lastInitial: true } },
    },
  },
  _count: { select: { payments: { where: { status: { in: ["LATE", "FAILED"] } } } } },
} as const satisfies Prisma.ParrainProfileSelect;

type ParrainRow = Prisma.ParrainProfileGetPayload<{ select: typeof parrainSelect }>;

function toBureauParrain(row: ParrainRow, at: Date): BureauParrain {
  return bureauParrainSchema.parse({
    id: row.id,
    displayName: row.displayName,
    fullName: `${row.firstName} ${row.lastName ?? `${row.lastInitial}.`}`,
    email: row.user.email,
    gender: row.gender,
    city: row.city,
    country: row.country,
    joinedAt: row.joinedAt.toISOString(),
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    filleuls: row.sponsorships.map((s) => `${s.child.firstName} ${s.child.lastInitial}.`),
    monthlyTotalCents: row.sponsorships.reduce((sum, s) => sum + s.monthlyAmountCents, 0),
    latePayments: row._count.payments,
    wishes: row.wishes,
    status: parrainStatus(
      {
        lastActiveAt: row.lastActiveAt,
        joinedAt: row.joinedAt,
        latePayments: row._count.payments,
        activeSponsorships: row.sponsorships.length,
      },
      at,
    ),
  });
}

/** Parrains (bureau) : la liste, et l'invitation d'une nouvelle personne. */
@Injectable()
export class BureauParrainsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: string): Promise<BureauParrains> {
    const at = now();
    const contains = { contains: q, mode: "insensitive" as const };
    const rows = await this.prisma.parrainProfile.findMany({
      where: q
        ? {
            OR: [
              { firstName: contains },
              { lastName: contains },
              { displayName: contains },
              { city: contains },
              { user: { email: contains } },
            ],
          }
        : {},
      select: parrainSelect,
    });
    return bureauParrainsSchema.parse({
      now: at.toISOString(),
      items: rows
        .map((row) => toBureauParrain(row, at))
        .sort(
          (a, b) =>
            collator.compare(a.displayName, b.displayName) || collator.compare(a.email, b.email),
        ),
    });
  }

  /**
   * Compte parrain créé par le bureau (pas d'inscription libre), puis invitation : un lien de
   * connexion de Better Auth, sous la forme de l'e-mail d'invitation. Audité.
   */
  async invite(actor: BureauActor, input: InviteParrain): Promise<BureauParrain> {
    const at = now();
    const email = input.email.trim().toLowerCase();
    const lastInitial = initialOf(input.lastName);
    const displayName = `${input.firstName} ${lastInitial}.`;
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new AppError(409, "Un compte existe déjà avec cette adresse", {
        email: ["Un compte existe déjà avec cette adresse"],
      });
    }
    const profileId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { id: randomUUID(), name: displayName, email, emailVerified: false, role: "parrain" },
        select: { id: true },
      });
      const profile = await tx.parrainProfile.create({
        data: {
          userId: user.id,
          firstName: input.firstName,
          lastInitial,
          lastName: input.lastName,
          displayName,
          gender: input.gender,
          city: input.city,
          country: input.country,
          addressLine: input.addressLine || null,
          postalCode: input.postalCode || null,
          wishes: input.wishes || null,
          avatarTone: "info",
          joinedAt: at,
          lastActiveAt: null,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "user.invite",
          entityType: "User",
          entityId: user.id,
          metadata: { role: "parrain" },
        },
      });
      return profile.id;
    });
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/parrain", metadata: { [INVITATION_METADATA]: true } },
      headers: new Headers(),
    });
    const row = await this.prisma.parrainProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: parrainSelect,
    });
    return toBureauParrain(row, at);
  }
}
