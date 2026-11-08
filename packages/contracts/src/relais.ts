// Contrats de l'espace relais (GET/POST /api/relais/*) et règles partagées avec le web : fraîcheur
// des nouvelles, saisie des résultats, code image. Dates en chaînes ISO, moyennes en centièmes.
import { z } from "zod";
import { avatarToneSchema } from "./avatar.js";
import { mediaRefSchema } from "./media.js";
import { genderSchema } from "./parrain.js";

const id = z.string().min(1);
const isoDateTime = z.iso.datetime();
const isoDate = z.iso.date();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Année scolaire d'une date : « 2026-2027 » de septembre à août. */
export function schoolYearOf(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 8 ? year : year - 1;
  return `${start}-${start + 1}`;
}

// ─── Écoles et classes ───────────────────────────────────────────────────────

export const schoolLevels = ["PRIMAIRE", "COLLEGE", "LYCEE"] as const;

export const schoolLevelSchema = z.enum(schoolLevels);

export type SchoolLevel = z.infer<typeof schoolLevelSchema>;

export const schoolLevelLabels: Readonly<Record<SchoolLevel, string>> = {
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
};

export const classNamesByLevel: Readonly<Record<SchoolLevel, readonly string[]>> = {
  PRIMAIRE: ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"],
  COLLEGE: ["6e", "5e", "4e", "3e"],
  LYCEE: ["2de", "1re", "Tle"],
};

export const schoolSchema = z.object({
  id,
  shortName: z.string(),
  fullName: z.string(),
  city: z.string(),
  level: schoolLevelSchema,
});

export type School = z.infer<typeof schoolSchema>;

export const schoolListSchema = z.object({ items: z.array(schoolSchema) });

export type SchoolList = z.infer<typeof schoolListSchema>;

/** POST /api/relais/schools. */
export const createSchoolSchema = z.object({
  shortName: z.string().trim().min(2, "Indiquez le nom de l'école").max(40),
  fullName: z.string().trim().max(120).default(""),
  city: z.string().trim().max(80).default(""),
  level: schoolLevelSchema,
});

export type CreateSchool = z.output<typeof createSchoolSchema>;

// ─── Fraîcheur des nouvelles (plan §8) ───────────────────────────────────────

export type NewsFreshness = "fresh" | "aging" | "stale";

/** Jours civils écoulés (UTC, l'heure de Lomé), jamais négatifs. */
export function daysSince(date: Date | string, now: Date | string): number {
  const day = (value: Date | string) => Math.floor(new Date(value).getTime() / MS_PER_DAY);
  return Math.max(0, day(now) - day(date));
}

/** Moins de 30 jours : à jour ; de 30 à 59 : à surveiller ; 60 et plus : en retard. */
export function newsFreshness(days: number): NewsFreshness {
  if (days < 30) {
    return "fresh";
  }
  return days < 60 ? "aging" : "stale";
}

// ─── Enfants ─────────────────────────────────────────────────────────────────

export const childFileStatuses = ["DRAFT", "SUBMITTED", "VALIDATED", "ARCHIVED"] as const;

export const childFileStatusSchema = z.enum(childFileStatuses);

export type ChildFileStatus = z.infer<typeof childFileStatusSchema>;

/** Ligne de « Mes enfants ». Jamais d'e-mail ni d'adresse de parrain. */
export const relaisChildRowSchema = z.object({
  id,
  /** « Aïcha S. » */
  name: z.string(),
  age: z.number().int().nonnegative(),
  className: z.string(),
  schoolName: z.string().nullable(),
  /** Noms des parrains actifs, par ordre alphabétique. */
  parrains: z.array(z.string()),
  /** Identifiants des parrains actifs (compte des destinataires d'une nouvelle). */
  parrainIds: z.array(z.string()),
  fileStatus: childFileStatusSchema,
  /** Dernière nouvelle publiée ou dernier résultat envoyé. */
  lastNewsAt: isoDateTime.nullable(),
  consentMedia: z.boolean(),
});

export type RelaisChildRow = z.infer<typeof relaisChildRowSchema>;

/** GET /api/relais/children : par ordre alphabétique. */
export const relaisChildListSchema = z.object({
  items: z.array(relaisChildRowSchema),
  now: isoDateTime,
});

export type RelaisChildList = z.infer<typeof relaisChildListSchema>;

/** GET /api/relais/home (RW-Accueil). */
export const relaisHomeSchema = z.object({
  stats: z.object({
    childCount: z.number().int().nonnegative(),
    newsThisMonth: z.number().int().nonnegative(),
    unreadMessages: z.number().int().nonnegative(),
    bulletinsToEnter: z.number().int().nonnegative(),
  }),
  /** Période en cours de saisie : « T1 », « 1er trimestre », date limite. */
  bulletinsDue: z
    .object({ term: z.string(), label: z.string(), dueDate: isoDate.nullable() })
    .nullable(),
  draftCount: z.number().int().nonnegative(),
  children: z.array(relaisChildRowSchema),
  /** Demandes d'appel à traiter (« Proposer des créneaux d'appel · Claire M. ↔ Aïcha S. »). */
  callRequests: z.array(
    z.object({
      id: z.string().min(1),
      parrainName: z.string(),
      childName: z.string(),
      conversationId: z.string().nullable(),
    }),
  ),
  /** Prochaine session élève planifiée (« Session d'écriture mardi »). */
  nextSession: z
    .object({
      id: z.string().min(1),
      scheduledAt: isoDateTime,
      childCount: z.number().int().nonnegative(),
    })
    .nullable(),
  now: isoDateTime,
});

export type RelaisHome = z.infer<typeof relaisHomeSchema>;

// ─── Code image de l'enfant ──────────────────────────────────────────────────

/** Les 6 images parmi lesquelles l'enfant reconnaît ses 3 images, dans l'ordre. */
export const childCodeImages = ["SOLEIL", "ARBRE", "POISSON", "MAISON", "ETOILE", "COEUR"] as const;

export const childCodeImageSchema = z.enum(childCodeImages);

export type ChildCodeImage = z.infer<typeof childCodeImageSchema>;

export const childCodeImageLabels: Readonly<Record<ChildCodeImage, string>> = {
  SOLEIL: "Soleil",
  ARBRE: "Arbre",
  POISSON: "Poisson",
  MAISON: "Maison",
  ETOILE: "Étoile",
  COEUR: "Cœur",
};

export const CHILD_CODE_LENGTH = 3;

/** Code image : 3 images distinctes, dans l'ordre. */
export const childCodeSchema = z
  .array(childCodeImageSchema)
  .length(CHILD_CODE_LENGTH)
  .refine((images) => new Set(images).size === images.length, "Trois images différentes");

export type ChildCode = z.infer<typeof childCodeSchema>;

/**
 * GET /api/relais/child-code : code proposé par le serveur, non enregistré. `token` le lie à cette
 * proposition : le navigateur ne peut pas en imposer un autre.
 */
export const childCodeProposalSchema = z.object({
  images: childCodeSchema,
  token: z.string().min(1),
});

export type ChildCodeProposal = z.infer<typeof childCodeProposalSchema>;

/** POST /api/relais/children/:id/code : le nouveau code, montré cette fois seulement. */
export const childCodeResetSchema = z.object({ images: childCodeSchema });

export type ChildCodeReset = z.infer<typeof childCodeResetSchema>;

// ─── Fiche d'un enfant ───────────────────────────────────────────────────────

/** Versions des textes d'accord présentés au responsable (ConsentRecord.textVersion). */
export const CONSENT_TEXT_VERSION = "2026-10";

export const consentTexts = {
  sponsorship:
    "Le responsable accepte le parrainage et l'échange de messages relus par l'association.",
  media:
    "Photos et vidéos de l'enfant autorisées, visibles uniquement par les parrains et l'association.",
} as const;

const optionalText = (max: number) => z.string().trim().max(max).default("");

/** Champs saisis : seule l'identité est exigée pour un brouillon. */
export const childFieldsSchema = z.object({
  firstName: z.string().trim().min(1, "Indiquez le prénom").max(60),
  lastInitial: z
    .string()
    .trim()
    .regex(/^\p{L}\.?$/u, "Indiquez la première lettre du nom")
    .transform((value) => value.charAt(0).toLocaleUpperCase("fr")),
  gender: genderSchema,
  birthDate: isoDate,
  district: optionalText(120),
  schoolId: id.max(64).nullable().default(null),
  className: optionalText(20),
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/, "Année scolaire attendue : 2026-2027"),
  teacherName: optionalText(80),
  guardianName: optionalText(120),
  guardianPhone: optionalText(30),
  consentSponsorship: z.boolean().default(false),
  consentMedia: z.boolean().default(false),
  photoMediaId: id.max(64).nullable().default(null),
  consentDocumentId: id.max(64).nullable().default(null),
});

export type ChildFields = z.output<typeof childFieldsSchema>;

/** POST /api/relais/children, POST /api/relais/children/:id. `submit` envoie le dossier au bureau. */
export const saveChildSchema = childFieldsSchema.extend({
  action: z.enum(["draft", "submit"]),
  /** Proposition de code à enregistrer à l'envoi au bureau, si l'enfant n'en a pas encore. */
  codeToken: z.string().max(500).nullable().default(null),
});

export type SaveChild = z.output<typeof saveChildSchema>;

const PHONE_PATTERN = /^\+?[\d\s.()-]{8,20}$/;

/** Ce qui manque à un dossier pour partir au bureau, par champ. */
export function childSubmissionIssues(fields: ChildFields): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  if (fields.district === "") issues.district = ["Indiquez le quartier ou le village"];
  if (fields.schoolId === null) issues.schoolId = ["Choisissez l'école"];
  if (fields.className === "") issues.className = ["Choisissez la classe"];
  if (fields.guardianName === "") issues.guardianName = ["Indiquez le nom du responsable"];
  if (!PHONE_PATTERN.test(fields.guardianPhone)) {
    issues.guardianPhone = ["Indiquez un numéro de téléphone"];
  }
  if (!fields.consentSponsorship) {
    issues.consentSponsorship = ["L'accord du responsable est indispensable au parrainage"];
  }
  return issues;
}

export const relaisChildDetailSchema = z.object({
  id,
  firstName: z.string(),
  lastInitial: z.string(),
  gender: genderSchema,
  birthDate: isoDate,
  district: z.string(),
  schoolId: z.string().nullable(),
  className: z.string(),
  schoolYear: z.string(),
  teacherName: z.string(),
  guardianName: z.string(),
  guardianPhone: z.string(),
  consentSponsorship: z.boolean(),
  consentMedia: z.boolean(),
  fileStatus: childFileStatusSchema,
  avatarTone: avatarToneSchema,
  photo: mediaRefSchema.nullable(),
  consentDocument: mediaRefSchema.nullable(),
  /** Un code est enregistré (jamais relisible). */
  hasCode: z.boolean(),
  parrains: z.array(z.string()),
  now: isoDateTime,
});

export type RelaisChildDetail = z.infer<typeof relaisChildDetailSchema>;

export const saveChildResultSchema = z.object({
  child: relaisChildDetailSchema,
  /** Code enregistré par cet envoi, à montrer une seule fois (carte à imprimer). */
  code: childCodeSchema.nullable(),
});

export type SaveChildResult = z.infer<typeof saveChildResultSchema>;

// ─── Nouvelles ───────────────────────────────────────────────────────────────

export const newsPostTypes = ["ONE_CHILD", "SEVERAL_CHILDREN", "RELAIS_LIFE"] as const;

export const newsPostTypeSchema = z.enum(newsPostTypes);

export type NewsPostType = z.infer<typeof newsPostTypeSchema>;

export const newsPostTypeLabels: Readonly<Record<NewsPostType, string>> = {
  ONE_CHILD: "Un enfant",
  SEVERAL_CHILDREN: "Plusieurs enfants",
  RELAIS_LIFE: "Vie du relais (tous)",
};

export const NEWS_TITLE_MAX_LENGTH = 120;
export const NEWS_BODY_MAX_LENGTH = 4000;
export const NEWS_MAX_MEDIA = 8;

/** POST /api/relais/news. Rejouer la même clé renvoie la même nouvelle (envoi hors ligne). */
export const createNewsSchema = z
  .object({
    type: newsPostTypeSchema,
    /** Vide pour « Vie du relais » : tous les enfants du relais. */
    childIds: z.array(id.max(64)).max(200).default([]),
    title: z.string().trim().min(1, "Donnez un titre").max(NEWS_TITLE_MAX_LENGTH),
    body: z.string().trim().min(1, "Écrivez le message aux parrains").max(NEWS_BODY_MAX_LENGTH),
    mediaIds: z.array(id.max(64)).max(NEWS_MAX_MEDIA).default([]),
    notifyParrains: z.boolean().default(true),
    notifyBureau: z.boolean().default(false),
    visibleToChildren: z.boolean().default(false),
    /** Date de publication : sans elle, la nouvelle paraît aussitôt. */
    scheduledAt: isoDateTime.nullable().default(null),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/, "Clé d'idempotence invalide"),
  })
  .refine((input) => input.type !== "ONE_CHILD" || input.childIds.length === 1, {
    path: ["childIds"],
    message: "Choisissez un enfant",
  })
  .refine((input) => input.type !== "SEVERAL_CHILDREN" || input.childIds.length >= 2, {
    path: ["childIds"],
    message: "Choisissez au moins deux enfants",
  })
  .refine((input) => new Set(input.childIds).size === input.childIds.length, {
    path: ["childIds"],
    message: "Le même enfant est choisi deux fois",
  })
  .refine((input) => new Set(input.mediaIds).size === input.mediaIds.length, {
    path: ["mediaIds"],
    message: "Le même fichier est joint deux fois",
  })
  .refine((input) => input.notifyParrains || input.notifyBureau || input.visibleToChildren, {
    path: ["notifyParrains"],
    message: "Choisissez au moins un destinataire",
  });

export type CreateNews = z.output<typeof createNewsSchema>;

export const newsPostStatusSchema = z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]);

export const createdNewsSchema = z.object({
  id,
  status: newsPostStatusSchema,
  publishedAt: isoDateTime.nullable(),
  scheduledAt: isoDateTime.nullable(),
  childCount: z.number().int().nonnegative(),
  parrainCount: z.number().int().nonnegative(),
});

export type CreatedNews = z.infer<typeof createdNewsSchema>;

export const scheduledNewsSchema = z.object({
  id,
  title: z.string(),
  scheduledAt: isoDateTime,
  childCount: z.number().int().nonnegative(),
});

export type ScheduledNews = z.infer<typeof scheduledNewsSchema>;

/** GET /api/relais/news/scheduled : de la plus proche à la plus lointaine. */
export const scheduledNewsListSchema = z.object({
  items: z.array(scheduledNewsSchema),
  now: isoDateTime,
});

export type ScheduledNewsList = z.infer<typeof scheduledNewsListSchema>;

// ─── Résultats scolaires ─────────────────────────────────────────────────────

const AVERAGE_MAX_X100 = 2000;

export const resultStatusSchema = z.enum(["TO_ENTER", "DRAFT", "SENT"]);

export type ResultStatus = z.infer<typeof resultStatusSchema>;

export const resultStatusLabels: Readonly<Record<ResultStatus, string>> = {
  TO_ENTER: "À saisir",
  DRAFT: "Brouillon",
  SENT: "Envoyé",
};

/** « 13,4 » ou « 13.45 » → 1340, 1345 ; `null` si vide ; `undefined` si invalide. */
export function parseAverage(text: string): number | null | undefined {
  const value = text.trim().replace(",", ".");
  if (value === "") {
    return null;
  }
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value)) {
    return undefined;
  }
  const x100 = Math.round(Number(value) * 100);
  return x100 <= AVERAGE_MAX_X100 ? x100 : undefined;
}

/** 1340 → « 13,4 », 1200 → « 12 », 1345 → « 13,45 ». */
export function formatAverageInput(averageX100: number | null): string {
  if (averageX100 === null) {
    return "";
  }
  return String(averageX100 / 100).replace(".", ",");
}

export type ParsedRank = { rank: number | null; classSize: number | null };

/** « 5 / 48 » → rang 5 sur 48, « 5 » → rang 5 ; `undefined` si invalide. */
export function parseRank(text: string): ParsedRank | undefined {
  const value = text.trim();
  if (value === "") {
    return { rank: null, classSize: null };
  }
  const match = /^(\d{1,3})(?:\s*\/\s*(\d{1,3}))?$/.exec(value);
  if (!match) {
    return undefined;
  }
  const rank = Number(match[1]);
  const classSize = match[2] === undefined ? null : Number(match[2]);
  if (rank < 1 || (classSize !== null && rank > classSize)) {
    return undefined;
  }
  return { rank, classSize };
}

/** Rang 5 sur 48 → « 5 / 48 ». */
export function formatRankInput({ rank, classSize }: ParsedRank): string {
  if (rank === null) {
    return "";
  }
  return classSize === null ? String(rank) : `${rank} / ${classSize}`;
}

export const academicPeriodOptionSchema = z.object({
  id,
  /** « 1er trimestre 2026-27 » */
  label: z.string(),
});

export type AcademicPeriodOption = z.infer<typeof academicPeriodOptionSchema>;

export const resultRowSchema = z.object({
  childId: id,
  /** « Aïcha S. » */
  name: z.string(),
  className: z.string(),
  averageX100: z.number().int().nullable(),
  rank: z.number().int().nullable(),
  classSize: z.number().int().nullable(),
  appreciation: z.string().nullable(),
  status: resultStatusSchema,
  allowChildUpload: z.boolean(),
  bulletins: z.array(mediaRefSchema),
  /** Pages que le relais peut retirer. */
  removableBulletinIds: z.array(z.string()),
  clientUpdatedAt: isoDateTime.nullable(),
});

export type ResultRow = z.infer<typeof resultRowSchema>;

/** `?periode=&ecole=` : sans valeur, la période en cours et la première école. */
export const relaisResultsQuerySchema = z.object({
  periode: id.max(64).optional(),
  ecole: id.max(64).optional(),
});

export type RelaisResultsQuery = z.infer<typeof relaisResultsQuerySchema>;

/** GET /api/relais/results (RW-Resultats). */
export const relaisResultsSchema = z.object({
  periods: z.array(academicPeriodOptionSchema),
  periodId: z.string().nullable(),
  /** Écoles du relais qui ont des enfants, avec leur effectif. */
  schools: z.array(
    z.object({ id, shortName: z.string(), childCount: z.number().int().nonnegative() }),
  ),
  schoolId: z.string().nullable(),
  rows: z.array(resultRowSchema),
  now: isoDateTime,
});

export type RelaisResults = z.infer<typeof relaisResultsSchema>;

/**
 * PUT /api/relais/results/:periodId/:childId : sauvegarde automatique. `clientUpdatedAt` est
 * l'heure de la saisie sur le poste : une donnée plus ancienne que l'enregistrée est refusée (409).
 */
export const saveResultSchema = z
  .object({
    averageX100: z.number().int().min(0).max(AVERAGE_MAX_X100).nullable(),
    rank: z.number().int().min(1).max(999).nullable(),
    classSize: z.number().int().min(1).max(999).nullable(),
    appreciation: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .transform((value) => (value === "" ? null : value)),
    clientUpdatedAt: isoDateTime,
  })
  .refine(
    (input) => input.rank === null || input.classSize === null || input.rank <= input.classSize,
    { path: ["rank"], message: "Le rang dépasse l'effectif de la classe" },
  );

export type SaveResult = z.output<typeof saveResultSchema>;

/** POST /api/relais/results/:periodId/:childId/bulletin. */
export const attachBulletinSchema = z.object({ mediaId: id.max(64) });

export type AttachBulletin = z.infer<typeof attachBulletinSchema>;

/** POST /api/relais/results/:periodId/send : les brouillons de l'école partent aux parrains. */
export const sendResultsSchema = z.object({ schoolId: id.max(64) });

export type SendResults = z.infer<typeof sendResultsSchema>;

export const sendResultsResultSchema = z.object({ sent: z.number().int().nonnegative() });

export type SendResultsResult = z.infer<typeof sendResultsResultSchema>;

/** POST /api/relais/results/:periodId/child-upload : « Laisser l'enfant envoyer son bulletin ». */
export const allowChildUploadSchema = z.object({
  schoolId: id.max(64),
  allowed: z.boolean(),
});

export type AllowChildUpload = z.infer<typeof allowChildUploadSchema>;

export const allowChildUploadResultSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type AllowChildUploadResult = z.infer<typeof allowChildUploadResultSchema>;

/** Un résultat est « saisi » dès qu'il n'est plus à saisir (compteur « 2 / 12 saisis »). */
export const isResultEntered = (row: Pick<ResultRow, "status">) => row.status !== "TO_ENTER";
