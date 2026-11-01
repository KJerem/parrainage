import type { MediaRef } from "@parrainage/contracts";
import type { Prisma } from "../generated/prisma/client.js";

export const mediaRefSelect = {
  id: true,
  kind: true,
  status: true,
  label: true,
  durationSec: true,
  mimeType: true,
} as const satisfies Prisma.MediaSelect;

export type MediaRefRow = Prisma.MediaGetPayload<{ select: typeof mediaRefSelect }>;

/** Médias montrés dans un contenu : prêts, ou emplacements de démonstration. */
export const listedMediaWhere = {
  status: { in: ["READY", "PLACEHOLDER"] },
} satisfies Prisma.MediaWhereInput;

/** Médias d'un contenu, dans leur ordre d'affichage. */
export const listedMedia = {
  where: listedMediaWhere,
  orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  select: mediaRefSelect,
} satisfies Prisma.MediaFindManyArgs;

export function toMediaRef(row: MediaRefRow): MediaRef {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    label: row.label,
    durationSec: row.durationSec,
    mimeType: row.mimeType,
  };
}
