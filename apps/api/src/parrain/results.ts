import type { Bulletin, ResultPoint, ResultsSummary } from "@parrainage/contracts";
import type { AcademicPeriodKind } from "../generated/prisma/enums.js";
import { type MediaRefRow, toMediaRef } from "../media/media-ref.js";

const KIND_ORDER: Record<AcademicPeriodKind, number> = { T1: 1, T2: 2, T3: 3, ANNUAL: 4 };

export interface SentResultRow {
  id: string;
  className: string;
  averageX100: number | null;
  rank: number | null;
  classSize: number | null;
  appreciation: string | null;
  sentAt: Date | null;
  period: { schoolYear: string; kind: AcademicPeriodKind; label: string };
  media: MediaRefRow[];
}

/** Période la plus récente d'abord : année scolaire, puis T3, T2, T1 (le bilan annuel en tête). */
export function compareResultsDesc(a: SentResultRow, b: SentResultRow): number {
  if (a.period.schoolYear !== b.period.schoolYear) {
    return a.period.schoolYear < b.period.schoolYear ? 1 : -1;
  }
  return KIND_ORDER[b.period.kind] - KIND_ORDER[a.period.kind];
}

function toResultPoint(row: SentResultRow): ResultPoint {
  return {
    id: row.id,
    schoolYear: row.period.schoolYear,
    periodKind: row.period.kind,
    periodLabel: row.period.label,
    className: row.className,
    averageX100: row.averageX100,
  };
}

/** Les deux derniers résultats envoyés et l'appréciation du plus récent. */
export function summarizeResults(rows: readonly SentResultRow[]): ResultsSummary {
  const [current, previous] = [...rows].sort(compareResultsDesc);
  return {
    previous: previous ? toResultPoint(previous) : null,
    current: current ? toResultPoint(current) : null,
    appreciation: current?.appreciation ?? null,
  };
}

export function toBulletins(rows: readonly SentResultRow[]): Bulletin[] {
  return [...rows].sort(compareResultsDesc).map((row) => ({
    ...toResultPoint(row),
    rank: row.rank,
    classSize: row.classSize,
    appreciation: row.appreciation,
    sentAt: row.sentAt?.toISOString() ?? null,
    media: row.media.map(toMediaRef),
  }));
}
