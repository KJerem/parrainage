import { schoolYearOf } from "@parrainage/contracts";
import { AppError } from "../common/app-error.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ChildFileStatus } from "../generated/prisma/enums.js";
import type { PrismaService } from "../prisma/prisma.service.js";

/** Relais connecté : toutes les requêtes de l'espace sont bornées à ses enfants. */
export interface RelaisActor {
  userId: string;
  relaisId: string;
}

/** Enfants suivis : un brouillon n'est pas encore un dossier, un archivé n'en est plus un. */
export const FOLLOWED_STATUSES: readonly ChildFileStatus[] = ["SUBMITTED", "VALIDATED"];

export const NOT_FOUND = () => new AppError(404, "Cet enfant n'est pas suivi par votre relais");

/**
 * Dernière nouvelle reçue par les parrains d'un enfant : nouvelle publiée ou résultat envoyé. À
 * lire avec `lastNewsAtOf`.
 */
export function lastNewsSelect(at: Date) {
  return {
    newsPosts: {
      where: { newsPost: { status: "PUBLISHED", notifyParrains: true, publishedAt: { lte: at } } },
      orderBy: { newsPost: { publishedAt: "desc" } },
      take: 1,
      select: { newsPost: { select: { publishedAt: true } } },
    },
    results: {
      where: { status: "SENT", sentAt: { lte: at } },
      orderBy: { sentAt: "desc" },
      take: 1,
      select: { sentAt: true },
    },
  } as const satisfies Prisma.ChildSelect;
}

export function lastNewsAtOf(child: {
  newsPosts: readonly { newsPost: { publishedAt: Date | null } }[];
  results: readonly { sentAt: Date | null }[];
}): Date | null {
  const dates = [child.newsPosts[0]?.newsPost.publishedAt, child.results[0]?.sentAt].filter(
    (date): date is Date => date instanceof Date,
  );
  return dates.reduce<Date | null>(
    (latest, date) => (!latest || date > latest ? date : latest),
    null,
  );
}

/** Ordre alphabétique français (la base trie par octets : « Aïcha » après « Ama »). */
export const byFrenchName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "fr");

/** « 2026-2027 » → « 2026-27 ». */
export const shortSchoolYear = (schoolYear: string) =>
  schoolYear.replace(/^(\d{4})-\d{2}(\d{2})$/, "$1-$2");

const academicPeriodSelect = {
  id: true,
  kind: true,
  label: true,
  schoolYear: true,
  dueDate: true,
} as const satisfies Prisma.AcademicPeriodSelect;

export type AcademicPeriodRow = Prisma.AcademicPeriodGetPayload<{
  select: typeof academicPeriodSelect;
}>;

/** Périodes de l'année scolaire en cours, de la première à la dernière. */
export function schoolYearPeriods(prisma: PrismaService, at: Date): Promise<AcademicPeriodRow[]> {
  return prisma.academicPeriod.findMany({
    where: { schoolYear: schoolYearOf(at) },
    orderBy: [{ dueDate: "asc" }, { kind: "asc" }],
    select: academicPeriodSelect,
  });
}

/** Période en cours de saisie : la prochaine échéance, sinon la dernière de l'année. */
export function currentPeriod(periods: readonly AcademicPeriodRow[], at: Date) {
  const today = at.toISOString().slice(0, 10);
  return (
    periods.find((p) => p.dueDate !== null && p.dueDate.toISOString().slice(0, 10) >= today) ??
    periods.at(-1) ??
    null
  );
}
