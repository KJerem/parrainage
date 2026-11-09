import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ageAt,
  avatarToneSchema,
  type BureauOverview,
  bureauOverviewSchema,
  type BureauSponsorship,
  type BureauSponsorships,
  type BureauSponsorshipsQuery,
  bureauSponsorshipsSchema,
  type CreatedSponsorship,
  createdSponsorshipSchema,
  type CreateSponsorship,
  daysSince,
  DEFAULT_MONTHLY_AMOUNT_CENTS,
  type NewSponsorship,
  newSponsorshipSchema,
  PARRAIN_CANDIDATES_LIMIT,
  type ParrainCandidates,
  type ParrainCandidatesQuery,
  parrainCandidatesSchema,
  SPONSORSHIP_ALERT_DAYS,
  sponsorshipHealthFilters,
  type WaitingChild,
  WATCH_LIST_SIZE,
  type WatchItem,
} from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import { now } from "../common/clock.js";
import type { Env } from "../config/env.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  sponsorshipCreatedParrainEmail,
  sponsorshipCreatedRelaisEmail,
} from "../mail/templates.js";
import { sendMailInBackground } from "../mail/transport.js";
import { mediaRefSelect, toMediaRef } from "../media/media-ref.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { lastNewsAtOf, lastNewsSelect } from "../relais/relais-common.js";
import { firstDayOfNextMonth, isInactiveParrain, latest, sponsorshipHealth } from "./health.js";

export interface BureauActor {
  userId: string;
}

const MS_PER_DAY = 86_400_000;
/** Une date de début au plus un an après aujourd'hui. */
const MAX_START_DAYS = 366;

const LATE_STATUSES = ["LATE", "FAILED"] as const;
/** Messages remis au destinataire : ils comptent comme un échange. */
const DELIVERED = ["APPROVED", "MASKED", "NOT_REQUIRED"] as const;

const collator = new Intl.Collator("fr");
const shortName = (p: { firstName: string; lastInitial: string }) =>
  `${p.firstName} ${p.lastInitial}.`;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const relaisSelect = { id: true, displayName: true, city: true } as const;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";

function sponsorshipSelect(at: Date) {
  return {
    id: true,
    startDate: true,
    monthlyAmountCents: true,
    child: {
      select: {
        id: true,
        firstName: true,
        lastInitial: true,
        relais: { select: relaisSelect },
        ...lastNewsSelect(at),
      },
    },
    parrain: {
      select: {
        id: true,
        displayName: true,
        country: true,
        lastActiveAt: true,
        joinedAt: true,
        _count: { select: { payments: { where: { status: { in: [...LATE_STATUSES] } } } } },
      },
    },
    conversation: {
      select: {
        messages: {
          where: { moderationStatus: { in: [...DELIVERED] }, createdAt: { lte: at } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    },
    _count: { select: { payments: { where: { status: { in: [...LATE_STATUSES] } } } } },
  } as const satisfies Prisma.SponsorshipSelect;
}

const waitingChildSelect = {
  id: true,
  firstName: true,
  lastInitial: true,
  gender: true,
  birthDate: true,
  className: true,
  avatarTone: true,
  consentMedia: true,
  fileStatus: true,
  submittedAt: true,
  validatedAt: true,
  school: { select: { shortName: true, city: true } },
  relais: { select: relaisSelect },
  photo: { select: mediaRefSelect },
} as const satisfies Prisma.ChildSelect;

type WaitingChildRow = Prisma.ChildGetPayload<{ select: typeof waitingChildSelect }>;

/** Dossiers envoyés d'abord (à vérifier), puis validés, du plus ancien au plus récent. */
const waitingOrder = (a: WaitingChildRow, b: WaitingChildRow) =>
  Number(a.fileStatus === "VALIDATED") - Number(b.fileStatus === "VALIDATED") ||
  (a.validatedAt ?? a.submittedAt ?? new Date(0)).getTime() -
    (b.validatedAt ?? b.submittedAt ?? new Date(0)).getTime() ||
  a.id.localeCompare(b.id);

/** Sans consentement médias, ou photo sans fichier affichable : les initiales. */
export function shownPhoto(child: {
  consentMedia: boolean;
  photo: Prisma.MediaGetPayload<{ select: typeof mediaRefSelect }> | null;
}) {
  return child.consentMedia &&
    child.photo &&
    (child.photo.status === "READY" || child.photo.status === "PLACEHOLDER")
    ? toMediaRef(child.photo)
    : null;
}

/** B-Binomes et vue d'ensemble : santé des binômes, enfants en attente, création d'un binôme. */
@Injectable()
export class BureauSponsorshipsService {
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get("APP_URL", { infer: true });
  }

  /** Binômes actifs, avec leur dernier échange et leur santé à `at`. */
  private async activeSponsorships(at: Date) {
    const rows = await this.prisma.sponsorship.findMany({
      where: { status: "ACTIVE" },
      select: sponsorshipSelect(at),
    });
    return rows
      .map((row) => {
        const lastNewsAt = lastNewsAtOf(row.child);
        const lastExchangeAt = latest(lastNewsAt, row.conversation?.messages[0]?.createdAt);
        const { health, days } = sponsorshipHealth({
          at,
          parrain: {
            lastActiveAt: row.parrain.lastActiveAt,
            joinedAt: row.parrain.joinedAt,
            latePayments: row.parrain._count.payments,
          },
          startDate: row.startDate,
          lastExchangeAt,
        });
        const item: BureauSponsorship = {
          id: row.id,
          child: {
            id: row.child.id,
            firstName: row.child.firstName,
            lastInitial: row.child.lastInitial,
          },
          parrain: { id: row.parrain.id, displayName: row.parrain.displayName },
          relais: row.child.relais,
          startDate: isoDay(row.startDate),
          monthlyAmountCents: row.monthlyAmountCents,
          lastExchangeAt: lastExchangeAt?.toISOString() ?? null,
          latePayments: row._count.payments,
          health,
        };
        return { item, days, lastNewsAt, country: row.parrain.country, startDate: row.startDate };
      })
      .sort(
        (a, b) =>
          collator.compare(a.item.child.firstName, b.item.child.firstName) ||
          collator.compare(a.item.parrain.displayName, b.item.parrain.displayName) ||
          a.item.id.localeCompare(b.item.id),
      );
  }

  private async waitingChildren(): Promise<WaitingChildRow[]> {
    const rows = await this.prisma.child.findMany({
      where: {
        fileStatus: { in: ["SUBMITTED", "VALIDATED"] },
        sponsorships: { none: { status: "ACTIVE" } },
      },
      select: waitingChildSelect,
    });
    return rows.sort(waitingOrder);
  }

  async overview(): Promise<BureauOverview> {
    const at = now();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const [sponsorships, waiting, collected, latePayments] = await Promise.all([
      this.activeSponsorships(at),
      this.waitingChildren(),
      this.prisma.payment.aggregate({
        where: { status: "RECEIVED", paidAt: { gte: monthStart, lte: at } },
        _sum: { amountCents: true },
      }),
      this.prisma.payment.count({ where: { status: { in: [...LATE_STATUSES] } } }),
    ]);

    // Enfants parrainés dont la dernière nouvelle (ou, à défaut, le début du binôme) a 60 jours.
    const newsAge = new Map<string, number>();
    for (const s of sponsorships) {
      const age = daysSince(s.lastNewsAt ?? s.startDate, at);
      newsAge.set(s.item.child.id, Math.min(age, newsAge.get(s.item.child.id) ?? age));
    }

    const alerts: WatchItem[] = sponsorships
      .filter((s) => s.item.health !== "ACTIVE")
      // Parrains inactifs d'abord (versements, engagement), puis les plus longs silences.
      .sort(
        (a, b) =>
          Number(b.item.health === "INACTIVE_PARRAIN") -
            Number(a.item.health === "INACTIVE_PARRAIN") || b.days - a.days,
      )
      .map((s) => ({
        kind: "sponsorship" as const,
        id: s.item.id,
        child: s.item.child,
        parrainName: s.item.parrain.displayName,
        relais: s.item.relais,
        health: s.item.health as "TO_FOLLOW_UP" | "INACTIVE_PARRAIN",
        days: s.days,
      }));
    const waitingItems: WatchItem[] = waiting.map((child) => ({
      kind: "waiting" as const,
      id: child.id,
      child: { id: child.id, firstName: child.firstName, lastInitial: child.lastInitial },
      relais: child.relais,
    }));
    // Les enfants à parrainer gardent toujours une place, après les alertes.
    const shownWaiting = waitingItems.slice(0, Math.min(waitingItems.length, 2));
    const watch = [...alerts.slice(0, WATCH_LIST_SIZE - shownWaiting.length), ...shownWaiting];

    return bureauOverviewSchema.parse({
      now: at.toISOString(),
      activeSponsorships: sponsorships.length,
      countries: new Set(sponsorships.map((s) => s.country)).size,
      relaisCount: new Set(sponsorships.map((s) => s.item.relais.id)).size,
      staleChildren: [...newsAge.values()].filter((age) => age >= SPONSORSHIP_ALERT_DAYS).length,
      collectedThisMonthCents: collected._sum.amountCents ?? 0,
      latePayments,
      watch: { items: watch, total: alerts.length + waitingItems.length },
    });
  }

  async list(query: BureauSponsorshipsQuery): Promise<BureauSponsorships> {
    const at = now();
    const [sponsorships, relais] = await Promise.all([
      this.activeSponsorships(at),
      this.prisma.relais.findMany({ select: relaisSelect }),
    ]);
    const health = query.etat ? sponsorshipHealthFilters[query.etat] : undefined;
    return bureauSponsorshipsSchema.parse({
      now: at.toISOString(),
      items: sponsorships
        .map((s) => s.item)
        .filter(
          (s) =>
            (!query.relais || s.relais.id === query.relais) && (!health || s.health === health),
        ),
      relais: relais.sort((a, b) => collator.compare(a.city, b.city)),
    });
  }

  /** L'enfant à parrainer (`?enfant=`, sinon le premier en attente) et les autres. */
  async newSponsorship(childId?: string): Promise<NewSponsorship> {
    const at = now();
    const waiting = await this.waitingChildren();
    const chosen = waiting.find((child) => child.id === childId) ?? waiting[0] ?? null;
    const child: WaitingChild | null = chosen && {
      id: chosen.id,
      firstName: chosen.firstName,
      lastInitial: chosen.lastInitial,
      gender: chosen.gender,
      age: ageAt(chosen.birthDate, at),
      className: chosen.className,
      schoolName: chosen.school?.shortName ?? null,
      city: chosen.school?.city ?? chosen.relais.city,
      avatarTone: avatarToneSchema.catch("neutral").parse(chosen.avatarTone),
      photo: shownPhoto(chosen),
      fileStatus: chosen.fileStatus,
      addedBy: chosen.relais.displayName,
    };
    return newSponsorshipSchema.parse({
      now: at.toISOString(),
      child,
      others: waiting
        .filter((other) => other.id !== chosen?.id)
        .map((other) => ({
          id: other.id,
          firstName: other.firstName,
          lastInitial: other.lastInitial,
        })),
      defaultMonthlyCents: DEFAULT_MONTHLY_AMOUNT_CENTS,
      defaultStartDate: firstDayOfNextMonth(at),
    });
  }

  /**
   * Parrains à proposer : jamais un parrain inactif ni suspendu, ni celui qui parraine déjà
   * l'enfant. Ceux qui attendent un filleul d'abord, puis les moins chargés, les plus actifs.
   */
  async candidates(query: ParrainCandidatesQuery): Promise<ParrainCandidates> {
    const at = now();
    const contains = { contains: query.q, mode: "insensitive" as const };
    const rows = await this.prisma.parrainProfile.findMany({
      where: {
        user: { OR: [{ banned: null }, { banned: false }] },
        ...(query.q
          ? {
              OR: [
                { firstName: contains },
                { lastName: contains },
                { displayName: contains },
                { city: contains },
                { user: { email: contains } },
              ],
            }
          : {}),
        ...(query.enfant
          ? { sponsorships: { none: { childId: query.enfant, status: "ACTIVE" } } }
          : {}),
      },
      select: {
        id: true,
        displayName: true,
        city: true,
        gender: true,
        wishes: true,
        lastActiveAt: true,
        joinedAt: true,
        sponsorships: {
          where: { status: "ACTIVE" },
          orderBy: { startDate: "asc" },
          select: { child: { select: { firstName: true, lastInitial: true } } },
        },
        _count: { select: { payments: { where: { status: { in: [...LATE_STATUSES] } } } } },
      },
      take: 200,
    });
    const items = rows
      .filter(
        (row) =>
          !isInactiveParrain(
            {
              lastActiveAt: row.lastActiveAt,
              joinedAt: row.joinedAt,
              latePayments: row._count.payments,
            },
            at,
          ),
      )
      .sort(
        (a, b) =>
          a.sponsorships.length - b.sponsorships.length ||
          (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0) ||
          collator.compare(a.displayName, b.displayName),
      )
      .slice(0, PARRAIN_CANDIDATES_LIMIT)
      .map((row) => ({
        id: row.id,
        displayName: row.displayName,
        city: row.city,
        gender: row.gender,
        wishes: row.wishes,
        filleuls: row.sponsorships.map((s) => shortName(s.child)),
      }));
    return parrainCandidatesSchema.parse({ items });
  }

  /**
   * « Créer et prévenir parrain et relais » : le binôme, sa conversation, la validation du
   * dossier s'il était seulement envoyé. Deux créations simultanées pour le même enfant : la
   * seconde attend la première, puis la refuse. E-mails : un lien, aucune donnée de l'enfant.
   */
  async create(actor: BureauActor, input: CreateSponsorship): Promise<CreatedSponsorship> {
    const at = now();
    const today = isoDay(at);
    const startDate = new Date(`${input.startDate}T00:00:00Z`);
    if (input.startDate < today) {
      throw new AppError(400, "Requête invalide", {
        startDate: ["Le binôme commence aujourd'hui ou plus tard"],
      });
    }
    if (startDate.getTime() - at.getTime() > MAX_START_DAYS * MS_PER_DAY) {
      throw new AppError(400, "Requête invalide", {
        startDate: ["Le binôme commence dans l'année qui vient"],
      });
    }
    const parrain = await this.prisma.parrainProfile.findFirst({
      where: { id: input.parrainId, user: { OR: [{ banned: null }, { banned: false }] } },
      select: { id: true, userId: true },
    });
    if (!parrain) {
      throw new AppError(404, "Ce parrain n'existe pas ou son compte est suspendu");
    }

    const created = await this.prisma
      .$transaction(async (tx) => {
        const [child] = await tx.$queryRaw<
          { id: string; firstName: string; relaisId: string; fileStatus: string }[]
        >`SELECT "id", "firstName", "relaisId", "fileStatus"::text AS "fileStatus"
          FROM "Child" WHERE "id" = ${input.childId} FOR UPDATE`;
        if (!child || (child.fileStatus !== "SUBMITTED" && child.fileStatus !== "VALIDATED")) {
          throw new AppError(404, "Cet enfant n'a pas de dossier prêt à être parrainé");
        }
        const active = await tx.sponsorship.count({
          where: { childId: child.id, status: "ACTIVE" },
        });
        if (active > 0) {
          throw new AppError(409, `${child.firstName} a déjà un parrain`);
        }
        if (child.fileStatus === "SUBMITTED") {
          await tx.child.update({
            where: { id: child.id },
            data: { fileStatus: "VALIDATED", validatedAt: at },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.userId,
              action: "child.validate",
              entityType: "Child",
              entityId: child.id,
              metadata: { via: "sponsorship" },
            },
          });
        }
        const sponsorship = await tx.sponsorship.create({
          data: {
            childId: child.id,
            parrainId: parrain.id,
            status: "ACTIVE",
            monthlyAmountCents: input.monthlyAmountCents,
            startDate,
          },
          select: { id: true },
        });
        const conversation = await tx.conversation.create({
          data: {
            kind: "SPONSORSHIP",
            sponsorshipId: sponsorship.id,
            childId: child.id,
            relaisId: child.relaisId,
            parrainId: parrain.id,
            lastMessageAt: at,
            participants: { create: [{ userId: parrain.userId }, { childId: child.id }] },
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: "sponsorship.create",
            entityType: "Sponsorship",
            entityId: sponsorship.id,
            metadata: {
              childId: child.id,
              parrainId: parrain.id,
              monthlyAmountCents: input.monthlyAmountCents,
              startDate: input.startDate,
            },
          },
        });
        return {
          id: sponsorship.id,
          childId: child.id,
          parrainId: parrain.id,
          conversationId: conversation.id,
          relaisId: child.relaisId,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new AppError(409, "Ce binôme existe déjà");
        }
        throw error;
      });

    const relais = await this.prisma.relais.findUniqueOrThrow({
      where: { id: created.relaisId },
      select: { userId: true },
    });
    await this.mail(
      parrain.userId,
      `/parrain?filleul=${encodeURIComponent(created.childId)}`,
      sponsorshipCreatedParrainEmail,
    );
    await this.mail(
      relais.userId,
      `/relais/enfants/${encodeURIComponent(created.childId)}`,
      sponsorshipCreatedRelaisEmail,
    );
    return createdSponsorshipSchema.parse(created);
  }

  private async mail(
    userId: string,
    path: string,
    build: (url: string) => { subject: string; text: string; html: string },
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, OR: [{ banned: null }, { banned: false }] },
      select: { email: true },
    });
    if (user) {
      sendMailInBackground({ to: user.email, ...build(new URL(path, this.appUrl).toString()) });
    }
  }
}
