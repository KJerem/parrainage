// Contenus de démonstration (plan §10) : périodes et résultats scolaires, nouvelles, conversations
// des binômes, messages, médias et versements simulés. Dates relatives au jour du seed.
import {
  type AlertSpan,
  type AlertType,
  CONSENT_TEXT_VERSION,
  detectAlerts,
  type ManualFlag,
  moderationReasonLabels,
} from "@parrainage/contracts";
import type { Gender, SeedChild, SeedData, SeedParrain, SeedSponsorship } from "./data.js";
import { addDays, schoolYearOf } from "./dates.js";
import { minimalPdf } from "./pdf.js";
import { createRandom } from "./random.js";

export type PeriodKind = "T1" | "T2" | "T3" | "ANNUAL";
export type MediaKind = "PHOTO" | "VIDEO" | "BULLETIN" | "AVATAR";
export type MediaStatus = "READY" | "PLACEHOLDER";
export type PaymentStatus = "SCHEDULED" | "RECEIVED" | "LATE";

export interface SeedPeriod {
  id: string;
  schoolYear: string;
  kind: PeriodKind;
  label: string;
  dueDate: Date | null;
}

export interface SeedResult {
  id: string;
  childId: string;
  periodId: string;
  className: string;
  averageX100: number | null;
  rank: number | null;
  classSize: number | null;
  appreciation: string | null;
  status: "TO_ENTER" | "DRAFT" | "SENT";
  allowChildUpload: boolean;
  enteredById: string | null;
  sentAt: Date | null;
  clientUpdatedAt: Date | null;
}

export interface SeedNews {
  id: string;
  relaisId: string;
  authorUserId: string;
  type: "ONE_CHILD";
  status: "PUBLISHED";
  title: string;
  body: string;
  notifyParrains: boolean;
  notifyBureau: boolean;
  visibleToChildren: boolean;
  scheduledAt: null;
  publishedAt: Date;
  sentFrom: "WEB" | "MOBILE";
  createdAt: Date;
  childIds: string[];
}

export interface SeedParticipant {
  id: string;
  userId: string | null;
  childId: string | null;
  lastReadAt: Date | null;
}

export type ConversationKind =
  "SPONSORSHIP" | "PARRAIN_RELAIS" | "RELAIS_BUREAU" | "PARRAIN_BUREAU";

export interface SeedConversation {
  id: string;
  kind: ConversationKind;
  sponsorshipId: string | null;
  childId: string | null;
  relaisId: string | null;
  parrainId: string | null;
  subject: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  participants: SeedParticipant[];
}

export interface SeedMessage {
  id: string;
  conversationId: string;
  kind: "TEXT" | "NEWSLETTER";
  body: string;
  /**
   * Enfant ↔ parrain : relu (APPROVED, HELD) ou en file de modération (PENDING) ; entre adultes :
   * sans relecture (NOT_REQUIRED).
   */
  moderationStatus: "APPROVED" | "NOT_REQUIRED" | "PENDING" | "HELD";
  deliveryStatus: "SENT" | "VERIFIED" | "RECEIVED";
  reviewedById: string | null;
  reviewedAt: Date | null;
  autoApproved: boolean;
  sentFrom: "WEB" | "SCHOOL_SESSION";
  readAt: Date | null;
  authorUserId: string | null;
  authorChildId: string | null;
  createdAt: Date;
  // Toujours écrits, pour qu'un nouveau seed efface les décisions prises entre-temps.
  alertTypes: AlertType[];
  autoAlerts: AlertSpan[];
  manualFlags: ManualFlag[];
  moderationReason: string | null;
  redactedBody: null;
}

export interface SeedMedia {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  storageKey: string | null;
  mimeType: string;
  sizeBytes: number | null;
  durationSec: number | null;
  label: string;
  uploadedByUserId: string | null;
  messageId: string | null;
  newsPostId: string | null;
  schoolResultId: string | null;
  position: number;
  createdAt: Date;
}

export interface SeedConsent {
  id: string;
  childId: string;
  type: "SPONSORSHIP" | "MEDIA";
  textVersion: string;
  recordedById: string;
  grantedAt: Date;
}

export interface SeedPayment {
  id: string;
  parrainId: string;
  sponsorshipId: string;
  childId: string;
  kind: "MONTHLY" | "ONE_OFF";
  amountCents: number;
  method: "SEPA_DEBIT" | "CARD";
  label: string | null;
  dueDate: Date;
  paidAt: Date | null;
  status: PaymentStatus;
  reference: string;
  periodKey: string | null;
}

/** Fichier réel déposé dans le stockage par le seed (le média reste PLACEHOLDER sinon). */
export interface SeedUpload {
  mediaId: string;
  storageKey: string;
  contentType: string;
  body: Buffer;
}

export interface SeedContent {
  periods: SeedPeriod[];
  results: SeedResult[];
  news: SeedNews[];
  consents: SeedConsent[];
  conversations: SeedConversation[];
  messages: SeedMessage[];
  media: SeedMedia[];
  /** Photo de profil de chaque enfant (Child.photoMediaId). */
  childPhotos: { childId: string; mediaId: string }[];
  payments: SeedPayment[];
  uploads: SeedUpload[];
}

/** Premier mois des versements simulés. */
const PAYMENTS_SINCE = { year: 2024, month: 0 };

const PERIOD_LABELS: Record<PeriodKind, string> = {
  T1: "1er trimestre",
  T2: "2e trimestre",
  T3: "3e trimestre",
  ANNUAL: "moyenne annuelle",
};

/** Instant UTC du jour `date` à `hours:minutes`. */
function at(date: Date, hours: number, minutes = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes),
  );
}

const utcDay = (year: number, month: number, date: number) => new Date(Date.UTC(year, month, date));

const periodKeyOf = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/** « 2026-2027 » → « 2026-27 ». */
const shortYear = (schoolYear: string) => schoolYear.replace(/^(\d{4})-\d{2}(\d{2})$/, "$1-$2");

const slugOf = (id: string) => id.replace(/^seed-[a-z]+-/, "");

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « d'octobre », « de novembre » : mois du jour du seed. */
export function ofMonth(date: Date): string {
  const month = MONTHS[date.getUTCMonth()]!;
  return /^[aeiou]/.test(month) ? `d'${month}` : `de ${month}`;
}

/** « Photo d'Aïcha », « Photo de Kofi ». */
export function photoOf(firstName: string): string {
  return /^[AEIOUÀÂÉÈÊËÎÏÔÛÜ]/i.test(firstName) ? `Photo d'${firstName}` : `Photo de ${firstName}`;
}

const pronoun = (gender: Gender) => (gender === "F" ? "Elle" : "Il");

/** Nouvelles génériques des enfants générés (le prénom et la classe sont insérés). */
const NEWS_TEMPLATES: readonly ((child: SeedChild) => { title: string; body: string })[] = [
  (c) => ({
    title: "Nouvelle de rentrée",
    body: `${c.firstName} a fait sa rentrée en ${c.className}. Son kit scolaire est complet : cahiers, stylos et uniforme.`,
  }),
  (c) => ({
    title: "Cours du soir",
    body: `${c.firstName} suit les cours du soir deux fois par semaine. ${pronoun(c.gender)} progresse en lecture.`,
  }),
  (c) => ({
    title: "Visite à la maison",
    body: `Nous avons rendu visite à la famille de ${c.firstName}. Tout va bien à la maison, et ${pronoun(c.gender).toLowerCase()} vous passe le bonjour.`,
  }),
  (c) => ({
    title: "Fête de l'école",
    body: `${c.firstName} a chanté avec sa classe de ${c.className} à la fête de l'école.`,
  }),
  (c) => ({
    title: "Nouvel uniforme",
    body: `${c.firstName} a reçu un nouvel uniforme grâce à votre parrainage. ${pronoun(c.gender)} vous dit merci !`,
  }),
];

/** Enfants de M. Koffi dont les résultats du 1er trimestre sont déjà envoyés. */
const T1_ALREADY_SENT = [
  "koffi-1",
  "koffi-2",
  "koffi-3",
  "koffi-5",
  "koffi-6",
  "koffi-7",
  "koffi-8",
  "koffi-10",
  "koffi-12",
];

/** Échanges relus de Paul et Kofi, en alternance (Paul écrit le premier). */
const PAUL_KOFI_HISTORY = [
  "Bonjour Kofi ! Je suis très heureux d'être ton parrain. Parle-moi de ton école ?",
  "Bonjour Paul ! Mon école est grande et j'ai beaucoup de copains. Merci pour les cahiers.",
  "Quelle est ta matière préférée cette année ?",
  "J'aime le calcul et le sport. Je joue au foot à la récréation.",
  "Moi aussi j'aimais le foot à ton âge. À quel poste joues-tu ?",
  "Je suis attaquant ! Le maître dit que je cours vite.",
  "Bravo ! As-tu bien travaillé ce trimestre ?",
  "Oui, j'ai progressé en lecture. Je lis une page chaque soir.",
  "C'est une très bonne habitude, continue comme ça.",
  "Merci Paul. Nous avons fêté la fin de l'année à l'école.",
  "Bonnes vacances Kofi ! Repose-toi bien.",
  "Merci ! J'aide ma grand-mère au marché pendant les vacances.",
  "C'est gentil de ta part. Prêt pour la rentrée ?",
  "Oui, je suis en CE1 maintenant et j'ai une nouvelle maîtresse.",
  "Raconte-moi ce que tu apprends avec elle.",
  "Nous apprenons les tables de multiplication. C'est difficile mais j'y arrive.",
  "Bravo pour tes efforts, je suis fier de toi.",
  "Merci Paul ! J'ai eu une bonne note en dictée.",
  "Formidable ! Continue à bien lire chaque soir.",
  "Oui ! Je lis maintenant à ma petite sœur aussi.",
  "Quelle bonne idée. Bonnes vacances à toute ta famille !",
];

/** Messages en attente des binômes de Kara et Kpalimé, sans alerte (le 4e a une photo). */
const OTHER_PENDING_MESSAGES: readonly { author: "child" | "parrain"; body: string }[] = [
  {
    author: "child",
    body: "Bonjour ! J'ai bien reçu les cahiers, merci beaucoup. Je travaille bien à l'école.",
  },
  { author: "parrain", body: "Bravo pour tes progrès en lecture, continue comme ça !" },
  { author: "child", body: "Merci pour ta lettre. Cette semaine nous avons appris les fractions." },
  { author: "child", body: "Ma classe a planté des arbres dans la cour, c'était très bien !" },
  {
    author: "parrain",
    body: "J'espère que la rentrée s'est bien passée. Quelle est ta matière préférée ?",
  },
  { author: "child", body: "Bonjour, je vais bien. J'aime beaucoup aller à l'école." },
  { author: "parrain", body: "Nous pensons bien à toi. Comment va ta famille ?" },
  { author: "parrain", body: "Quel beau dessin ! Merci de me l'avoir envoyé." },
];

export function buildSeedContent(today: Date, data: SeedData): SeedContent {
  const random = createRandom(20261101);
  const ago = (days: number) => addDays(today, -days);
  const schoolYear = schoolYearOf(today);
  const startYear = Number(schoolYear.slice(0, 4));
  const previousYear = `${startYear - 1}-${startYear}`;

  const child = (slug: string) => {
    const found = data.children.find((c) => c.id === `seed-child-${slug}`);
    if (!found) {
      throw new Error(`Enfant du seed introuvable : ${slug}`);
    }
    return found;
  };
  const relaisOf = (c: SeedChild) => data.relais.find((r) => r.relais.id === c.relaisId)!;
  const parrainOf = (s: SeedSponsorship): SeedParrain =>
    data.parrains.find((p) => p.profile.id === s.parrainId)!;
  const sponsorshipOf = (childSlug: string, parrainSlug: string) => {
    const found = data.sponsorships.find(
      (s) =>
        s.childId === `seed-child-${childSlug}` && s.parrainId === `seed-parrain-${parrainSlug}`,
    );
    if (!found) {
      throw new Error(`Binôme du seed introuvable : ${childSlug} / ${parrainSlug}`);
    }
    return found;
  };
  const koffiUserId = data.relais[0]!.id;
  const bureauUserId = data.bureau.id;
  const claireUserId = data.parrains.find((p) => p.email === "claire.m@exemple.fr")!.id;
  const aicha = child("aicha");
  const kofi = child("kofi");

  // ─── Périodes et résultats ─────────────────────────────────────────────────
  const periodId = (year: string, kind: PeriodKind) => `seed-period-${year}-${kind.toLowerCase()}`;
  const periods: SeedPeriod[] = [
    { schoolYear: previousYear, kind: "ANNUAL" as const, dueDate: utcDay(startYear, 6, 15) },
    { schoolYear, kind: "T1" as const, dueDate: utcDay(startYear, 10, 15) },
    { schoolYear, kind: "T2" as const, dueDate: utcDay(startYear + 1, 2, 15) },
    { schoolYear, kind: "T3" as const, dueDate: utcDay(startYear + 1, 6, 10) },
  ].map((p) => ({ ...p, id: periodId(p.schoolYear, p.kind), label: PERIOD_LABELS[p.kind] }));

  const resultId = (c: SeedChild, year: string, kind: PeriodKind) =>
    `seed-result-${slugOf(c.id)}-${year}-${kind.toLowerCase()}`;
  const t1 = periodId(schoolYear, "T1");
  const aichaT1 = resultId(aicha, schoolYear, "T1");
  const aichaAnnual = resultId(aicha, previousYear, "ANNUAL");
  const bulletinSentAt = at(ago(2), 14, 30);
  const results: SeedResult[] = [
    {
      id: aichaAnnual,
      childId: aicha.id,
      periodId: periodId(previousYear, "ANNUAL"),
      className: "CM1",
      averageX100: 1180,
      rank: null,
      classSize: null,
      appreciation: "Année encourageante, des efforts réguliers en lecture.",
      status: "SENT",
      allowChildUpload: false,
      enteredById: koffiUserId,
      sentAt: at(utcDay(startYear, 6, 10), 10),
      clientUpdatedAt: null,
    },
    ...data.children.map((c): SeedResult => {
      const base = {
        id: resultId(c, schoolYear, "T1"),
        childId: c.id,
        periodId: t1,
        className: c.className,
        allowChildUpload: false,
        clientUpdatedAt: null,
      };
      if (c.id === aicha.id) {
        return {
          ...base,
          averageX100: 1340,
          rank: 5,
          classSize: 48,
          appreciation: "Élève sérieuse, en net progrès en mathématiques.",
          status: "SENT",
          allowChildUpload: true,
          enteredById: koffiUserId,
          sentAt: bulletinSentAt,
          clientUpdatedAt: at(ago(2), 14, 10),
        };
      }
      if (c.id === kofi.id) {
        return {
          ...base,
          averageX100: 1090,
          rank: 21,
          classSize: 52,
          appreciation: "Doit participer davantage à l'oral.",
          status: "DRAFT",
          enteredById: koffiUserId,
          sentAt: null,
          clientUpdatedAt: at(ago(2), 14, 20),
        };
      }
      // « Saisir 7 bulletins du T1 » : M. Koffi a déjà envoyé les résultats de 9 autres enfants,
      // ceux qui ont aussi des nouvelles récentes (les 5 sans nouvelle le restent).
      const sentIndex = T1_ALREADY_SENT.indexOf(c.id.replace("seed-child-", ""));
      if (sentIndex >= 0) {
        const sentAt = at(ago(3 + sentIndex), 15);
        return {
          ...base,
          averageX100: 1000 + sentIndex * 45,
          rank: 4 + sentIndex * 2,
          classSize: 44,
          appreciation: "Bon trimestre, continue tes efforts.",
          status: "SENT",
          enteredById: koffiUserId,
          sentAt,
          clientUpdatedAt: sentAt,
        };
      }
      return {
        ...base,
        averageX100: null,
        rank: null,
        classSize: null,
        appreciation: null,
        status: "TO_ENTER",
        enteredById: null,
        sentAt: null,
      };
    }),
  ];

  // ─── Conversations des binômes actifs ──────────────────────────────────────
  const conversationId = (s: SeedSponsorship) => `seed-conversation-${slugOf(s.id)}`;
  const claireAicha = sponsorshipOf("aicha", "claire");
  const claireKofi = sponsorshipOf("kofi", "claire");

  const media: SeedMedia[] = [];
  const addMedia = (
    spec: Partial<SeedMedia> & Pick<SeedMedia, "id" | "kind" | "mimeType" | "label">,
  ) => {
    media.push({
      status: "PLACEHOLDER",
      storageKey: null,
      sizeBytes: null,
      durationSec: null,
      uploadedByUserId: null,
      messageId: null,
      newsPostId: null,
      schoolResultId: null,
      position: 0,
      createdAt: today,
      ...spec,
    });
  };

  const claireToAicha = at(ago(17), 17, 30);
  const aichaToClaire = at(ago(1), 15, 0);
  // Le 2 septembre de la rentrée, et jamais après la veille du jour du seed.
  const kofiThanks = new Date(
    Math.min(at(utcDay(startYear, 8, 2), 15).getTime(), at(ago(1), 9).getTime()),
  );
  const noModeration = {
    alertTypes: [],
    autoAlerts: [],
    manualFlags: [],
    moderationReason: null,
    redactedBody: null,
  } satisfies Partial<SeedMessage>;
  const messages: SeedMessage[] = [
    {
      ...noModeration,
      id: "seed-message-claire-to-aicha",
      conversationId: conversationId(claireAicha),
      kind: "TEXT",
      body: "Bravo pour ta rentrée Aïcha ! Déléguée de classe, je suis très fière de toi. Raconte-moi ta maîtresse ?",
      moderationStatus: "APPROVED",
      deliveryStatus: "RECEIVED",
      reviewedById: bureauUserId,
      reviewedAt: at(ago(16), 8, 15),
      autoApproved: false,
      sentFrom: "WEB",
      readAt: at(ago(15), 15, 10),
      authorUserId: claireUserId,
      authorChildId: null,
      createdAt: claireToAicha,
    },
    {
      ...noModeration,
      id: "seed-message-aicha-to-claire",
      conversationId: conversationId(claireAicha),
      kind: "TEXT",
      body: "Bonjour tata Claire ! J'ai eu mon bulletin du premier trimestre. J'ai progressé en calcul grâce aux cours du soir. Je t'envoie aussi une photo de notre classe.",
      moderationStatus: "APPROVED",
      deliveryStatus: "VERIFIED",
      reviewedById: bureauUserId,
      reviewedAt: at(ago(1), 16, 10),
      autoApproved: false,
      sentFrom: "SCHOOL_SESSION",
      readAt: null,
      authorUserId: null,
      authorChildId: aicha.id,
      createdAt: aichaToClaire,
    },
    {
      ...noModeration,
      id: "seed-message-kofi-to-claire",
      conversationId: conversationId(claireKofi),
      kind: "TEXT",
      body: "Merci pour le ballon !",
      moderationStatus: "APPROVED",
      // Lu par Claire 5 h après l'envoi (dernière lecture de la conversation, ci-dessous).
      deliveryStatus: "RECEIVED",
      reviewedById: bureauUserId,
      reviewedAt: new Date(kofiThanks.getTime() + 2 * 3600 * 1000),
      autoApproved: false,
      sentFrom: "SCHOOL_SESSION",
      readAt: new Date(kofiThanks.getTime() + 5 * 3600 * 1000),
      authorUserId: null,
      authorChildId: kofi.id,
      createdAt: kofiThanks,
    },
  ];

  // ─── Historique de Paul ↔ Kofi (B-Moderation : « 23 messages · 1 retenu (mars 2025) ») ───
  const paulKofi = sponsorshipOf("kofi", "paul");
  const paulUserId = parrainOf(paulKofi).id;
  const historyFirst = addDays(paulKofi.startDate, 20).getTime();
  const historyLast = at(ago(64), 15).getTime();
  const paulKofiHistory = PAUL_KOFI_HISTORY.map((body, index): SeedMessage => {
    const fromPaul = index % 2 === 0;
    const createdAt = new Date(
      historyFirst + ((historyLast - historyFirst) * index) / (PAUL_KOFI_HISTORY.length - 1),
    );
    return {
      ...noModeration,
      id: `seed-message-kofi-paul-${index + 1}`,
      conversationId: conversationId(paulKofi),
      kind: "TEXT",
      body,
      moderationStatus: "APPROVED",
      deliveryStatus: "RECEIVED",
      reviewedById: bureauUserId,
      reviewedAt: new Date(createdAt.getTime() + 3 * 3600 * 1000),
      autoApproved: false,
      sentFrom: fromPaul ? "WEB" : "SCHOOL_SESSION",
      readAt: new Date(createdAt.getTime() + 24 * 3600 * 1000),
      authorUserId: fromPaul ? paulUserId : null,
      authorChildId: fromPaul ? null : kofi.id,
      createdAt,
    };
  });
  const paulKofiLastRead = new Date(historyLast + 24 * 3600 * 1000);
  const heldBody = "Tu peux m'écrire sur Facebook, je t'enverrai mon profil.";
  const heldDetection = detectAlerts(heldBody);
  // Mois comptés à partir de 0 : le 12 mars de l'avant-dernière année civile de la rentrée.
  const heldAt = at(utcDay(startYear - 1, 2, 12), 18);
  messages.push(...paulKofiHistory, {
    ...noModeration,
    id: "seed-message-kofi-paul-retenu",
    conversationId: conversationId(paulKofi),
    kind: "TEXT",
    body: heldBody,
    moderationStatus: "HELD",
    deliveryStatus: "SENT",
    reviewedById: bureauUserId,
    reviewedAt: new Date(heldAt.getTime() + 2 * 3600 * 1000),
    autoApproved: false,
    sentFrom: "WEB",
    readAt: null,
    authorUserId: paulUserId,
    authorChildId: null,
    createdAt: heldAt,
    alertTypes: heldDetection.types,
    autoAlerts: heldDetection.spans,
    moderationReason: moderationReasonLabels.OFF_PLATFORM_CONTACT,
  });

  // ─── File de modération (Bureau, B-Moderation) : 12 messages, dont 3 avec un média ─────────
  // Datés du jour du seed, pour la maquette à 10 h (« il y a 5 h », « il y a 2 h », « hier »).
  const pendingMessage = (
    slug: string,
    sponsorship: SeedSponsorship,
    author: "child" | "parrain",
    body: string,
    createdAt: Date,
    manualFlags: ManualFlag[] = [],
  ): SeedMessage => {
    const detection = detectAlerts(body);
    return {
      ...noModeration,
      id: `seed-message-attente-${slug}`,
      conversationId: conversationId(sponsorship),
      kind: "TEXT",
      body,
      moderationStatus: "PENDING",
      deliveryStatus: "SENT",
      reviewedById: null,
      reviewedAt: null,
      autoApproved: false,
      sentFrom: author === "child" ? "SCHOOL_SESSION" : "WEB",
      readAt: null,
      authorUserId: author === "parrain" ? parrainOf(sponsorship).id : null,
      authorChildId: author === "child" ? sponsorship.childId : null,
      createdAt,
      alertTypes: detection.types,
      autoAlerts: detection.spans,
      manualFlags,
    };
  };
  const mariamAt = at(ago(1), 22);
  const aichaPendingAt = at(today, 8);
  messages.push(
    pendingMessage(
      "paul",
      paulKofi,
      "parrain",
      "Salut Kofi ! Bravo pour ton match de foot. Si tu veux, tu peux m'appeler directement sur WhatsApp au 06 39 98 12 34, ce sera plus simple. À bientôt !",
      at(today, 5),
    ),
    pendingMessage("mariam", sponsorshipOf("mariam", "helene"), "child", "", mariamAt, [
      "OTHER_CHILD_FACE",
    ]),
    pendingMessage(
      "aicha",
      claireAicha,
      "child",
      "Bonjour tata Claire ! Voici la deuxième page de mon bulletin, celle que j'avais oubliée. Le maître m'a félicitée en lecture.",
      aichaPendingAt,
    ),
    pendingMessage(
      "yao",
      sponsorshipOf("yao", "marc"),
      "child",
      "Bonjour Marc ! Je suis entré en 5e cette année. J'aime beaucoup les sciences et je lis le livre que tu m'as envoyé.",
      at(today, 8, 10),
    ),
  );
  const distantSponsorships = data.sponsorships.filter(
    (s) => s.status === "ACTIVE" && /^seed-child-(diallo|agbeko)-/.test(s.childId),
  );
  OTHER_PENDING_MESSAGES.forEach(({ author, body }, index) => {
    const sponsorship = distantSponsorships[index];
    if (!sponsorship) {
      throw new Error(`Binôme du seed introuvable pour le message en attente ${index + 1}`);
    }
    messages.push(
      pendingMessage(
        `relais-${index + 1}`,
        sponsorship,
        author,
        body,
        at(today, 8, 20 + index * 5),
      ),
    );
  });
  addMedia({
    id: "seed-media-attente-aicha-bulletin",
    kind: "BULLETIN",
    mimeType: "application/pdf",
    label: "Bulletin T1 : page 2",
    messageId: "seed-message-attente-aicha",
    createdAt: aichaPendingAt,
  });
  addMedia({
    id: "seed-media-attente-mariam-video",
    kind: "VIDEO",
    mimeType: "video/mp4",
    label: "Vidéo de la classe",
    durationSec: 35,
    messageId: "seed-message-attente-mariam",
    createdAt: mariamAt,
  });
  addMedia({
    id: "seed-media-attente-photo",
    kind: "PHOTO",
    mimeType: "image/jpeg",
    label: "Photo de la cour",
    messageId: "seed-message-attente-relais-4",
    createdAt: at(today, 8, 35),
  });

  const conversations: SeedConversation[] = data.sponsorships
    .filter((s) => s.status === "ACTIVE")
    .map((s) => {
      const id = conversationId(s);
      // Le message d'un enfant ne compte qu'une fois remis : son parrain ne l'a pas encore vu.
      const own = messages.filter(
        (m) => m.conversationId === id && !(m.moderationStatus === "PENDING" && m.authorChildId),
      );
      const createdAt = at(s.startDate, 9);
      const lastMessageAt = own.reduce(
        (latest, m) => (m.createdAt > latest ? m.createdAt : latest),
        createdAt,
      );
      // Claire a lu le merci de Kofi, pas encore le message d'Aïcha d'hier (« Aïcha vous a
      // écrit » sur la maquette). Paul a tout lu de son long historique avec Kofi. Les autres
      // parrains n'ont rien lu.
      const parrainRead =
        id === conversationId(claireAicha)
          ? claireToAicha
          : id === conversationId(claireKofi)
            ? new Date(kofiThanks.getTime() + 5 * 3600 * 1000)
            : id === conversationId(paulKofi)
              ? paulKofiLastRead
              : null;
      const childRead = id === conversationId(claireAicha) ? at(ago(15), 15, 10) : null;
      return {
        id,
        kind: "SPONSORSHIP" as const,
        sponsorshipId: s.id,
        childId: s.childId,
        relaisId: data.children.find((c) => c.id === s.childId)!.relaisId,
        parrainId: s.parrainId,
        subject: null,
        lastMessageAt,
        createdAt,
        participants: [
          { id: `${id}-parrain`, userId: parrainOf(s).id, childId: null, lastReadAt: parrainRead },
          { id: `${id}-enfant`, userId: null, childId: s.childId, lastReadAt: childRead },
        ].map((p) => ({ ...p, id: p.id.replace("seed-conversation-", "seed-participant-") })),
      };
    });

  // ─── Conversations entre adultes (P-Messages et RW-Messages) ─────────────────
  // Non-lus : Claire en a 2, comme la pastille « 2 » de la maquette (le message d'Aïcha d'hier
  // et le créneau proposé par M. Koffi) ; M. Koffi en a 1 (la demande d'appel de Claire).
  const parrainUserId = (slug: string) =>
    data.parrains.find((p) => p.profile.id === `seed-parrain-${slug}`)!.id;
  const adultMessage = (
    slug: string,
    conversation: string,
    authorUserId: string,
    body: string,
    createdAt: Date,
    readAt: Date | null,
    kind: SeedMessage["kind"] = "TEXT",
  ): SeedMessage => ({
    ...noModeration,
    id: `seed-message-${slug}`,
    conversationId: `seed-conversation-${conversation}`,
    kind,
    body,
    moderationStatus: "NOT_REQUIRED",
    deliveryStatus: readAt ? "RECEIVED" : "VERIFIED",
    reviewedById: null,
    reviewedAt: null,
    autoApproved: false,
    sentFrom: "WEB",
    readAt,
    authorUserId,
    authorChildId: null,
    createdAt,
  });
  const adultConversation = (
    slug: string,
    spec: Pick<SeedConversation, "kind" | "childId" | "relaisId" | "parrainId" | "subject">,
    createdAt: Date,
    readers: readonly { who: string; userId: string; lastReadAt: Date | null }[],
  ): SeedConversation => {
    const id = `seed-conversation-${slug}`;
    const own = messages.filter((m) => m.conversationId === id);
    return {
      id,
      sponsorshipId: null,
      ...spec,
      lastMessageAt: own.reduce(
        (latest, m) => (m.createdAt > latest ? m.createdAt : latest),
        createdAt,
      ),
      createdAt,
      participants: readers.map((r) => ({
        id: `seed-participant-${slug}-${r.who}`,
        userId: r.userId,
        childId: null,
        lastReadAt: r.lastReadAt,
      })),
    };
  };
  const koffiRelaisId = data.relais[0]!.relais.id;
  const claireRequestAt = at(ago(3), 19);
  const koffiSlotAt = at(ago(1), 8, 30);
  const paulAskAt = at(ago(4), 20, 15);
  const heleneThanksAt = at(ago(5), 18, 40);
  const receiptsAt = at(ago(2), 10);
  const newsletterAt = at(ago(6), 9);
  messages.push(
    adultMessage(
      "claire-to-koffi",
      "claire-koffi",
      claireUserId,
      "Bonjour M. Koffi, serait-il possible d'organiser un appel avec Aïcha avant Noël ? Je suis disponible le week-end.",
      claireRequestAt,
      null,
    ),
    adultMessage(
      "koffi-to-claire",
      "claire-koffi",
      koffiUserId,
      "Créneau proposé pour l'appel : samedi matin, avec Aïcha à l'école. Dites-moi s'il vous convient.",
      koffiSlotAt,
      null,
    ),
    adultMessage(
      "paul-to-koffi",
      "paul-koffi",
      parrainUserId("paul"),
      "Des nouvelles de Kofi ?",
      paulAskAt,
      at(ago(3), 8),
    ),
    adultMessage(
      "helene-to-koffi",
      "helene-koffi",
      parrainUserId("helene"),
      "Merci pour la vidéo !",
      heleneThanksAt,
      at(ago(5), 21),
    ),
    adultMessage(
      "bureau-to-koffi",
      "koffi-bureau",
      bureauUserId,
      `Reçus ${ofMonth(today)} : merci de nous transmettre les justificatifs des achats du mois.`,
      receiptsAt,
      at(ago(2), 12),
    ),
    adultMessage(
      "bureau-newsletter-claire",
      "claire-bureau",
      bureauUserId,
      `Lettre d'information ${ofMonth(today)} : la rentrée s'est bien passée à Lomé, Kara et Kpalimé, et chaque enfant parrainé a reçu son kit scolaire. Merci pour votre fidélité !`,
      newsletterAt,
      at(ago(5), 19),
      "NEWSLETTER",
    ),
  );
  conversations.push(
    adultConversation(
      "claire-koffi",
      {
        kind: "PARRAIN_RELAIS",
        childId: aicha.id,
        relaisId: koffiRelaisId,
        parrainId: claireAicha.parrainId,
        subject: "Demande d'appel vidéo avec Aïcha S.",
      },
      at(ago(3), 18),
      [
        { who: "parrain", userId: claireUserId, lastReadAt: claireRequestAt },
        { who: "relais", userId: koffiUserId, lastReadAt: null },
      ],
    ),
    adultConversation(
      "paul-koffi",
      {
        kind: "PARRAIN_RELAIS",
        childId: kofi.id,
        relaisId: koffiRelaisId,
        parrainId: "seed-parrain-paul",
        subject: null,
      },
      at(ago(4), 20),
      [
        { who: "parrain", userId: parrainUserId("paul"), lastReadAt: paulAskAt },
        { who: "relais", userId: koffiUserId, lastReadAt: at(ago(3), 8) },
      ],
    ),
    adultConversation(
      "helene-koffi",
      {
        kind: "PARRAIN_RELAIS",
        childId: child("mariam").id,
        relaisId: koffiRelaisId,
        parrainId: "seed-parrain-helene",
        subject: null,
      },
      at(ago(5), 18),
      [
        { who: "parrain", userId: parrainUserId("helene"), lastReadAt: heleneThanksAt },
        { who: "relais", userId: koffiUserId, lastReadAt: at(ago(5), 21) },
      ],
    ),
    adultConversation(
      "koffi-bureau",
      {
        kind: "RELAIS_BUREAU",
        childId: null,
        relaisId: koffiRelaisId,
        parrainId: null,
        subject: null,
      },
      at(ago(2), 9),
      [
        { who: "relais", userId: koffiUserId, lastReadAt: at(ago(2), 12) },
        { who: "bureau", userId: bureauUserId, lastReadAt: receiptsAt },
      ],
    ),
    adultConversation(
      "claire-bureau",
      {
        kind: "PARRAIN_BUREAU",
        childId: null,
        relaisId: null,
        parrainId: claireAicha.parrainId,
        subject: null,
      },
      at(ago(6), 8),
      [
        { who: "parrain", userId: claireUserId, lastReadAt: at(ago(5), 19) },
        { who: "bureau", userId: bureauUserId, lastReadAt: newsletterAt },
      ],
    ),
  );

  // Pièces jointes du message d'Aïcha : photo de la classe et bulletin du 1er trimestre (PDF réel).
  const bulletinMediaId = "seed-media-aicha-bulletin-t1";
  const bulletinKey = `seed/bulletins/aicha-${schoolYear}-t1.pdf`;
  const bulletinPdf = minimalPdf(`Bulletin du 1er trimestre ${schoolYear} - Aïcha S.`, [
    { text: "LRT Parrainage · bulletin scolaire", size: 11 },
    { text: `Bulletin du 1er trimestre ${schoolYear}`, size: 20, bold: true },
    { text: "Aïcha S. · CM2 · École primaire publique de Bè, Lomé (Togo)" },
    { text: "Moyenne générale : 13,4 / 20 · Rang : 5 / 48", bold: true },
    { text: "Appréciation : « Élève sérieuse, en net progrès en mathématiques. »" },
    { text: "Document de démonstration : toutes les données sont fictives.", size: 9 },
  ]);
  addMedia({
    id: "seed-media-aicha-classe",
    kind: "PHOTO",
    mimeType: "image/jpeg",
    label: "Photo de la classe",
    messageId: "seed-message-aicha-to-claire",
    position: 0,
    createdAt: aichaToClaire,
  });
  addMedia({
    id: bulletinMediaId,
    kind: "BULLETIN",
    status: "READY",
    storageKey: bulletinKey,
    mimeType: "application/pdf",
    sizeBytes: bulletinPdf.length,
    label: `Bulletin T1 — ${shortYear(schoolYear)}`,
    uploadedByUserId: koffiUserId,
    messageId: "seed-message-aicha-to-claire",
    schoolResultId: aichaT1,
    position: 1,
    createdAt: at(ago(2), 14, 0),
  });
  addMedia({
    id: "seed-media-aicha-bulletin-annuel",
    kind: "BULLETIN",
    mimeType: "image/jpeg",
    label: `Bulletin annuel — ${shortYear(previousYear)}`,
    uploadedByUserId: koffiUserId,
    schoolResultId: aichaAnnual,
    createdAt: at(utcDay(startYear, 6, 10), 9),
  });

  // ─── Nouvelles ─────────────────────────────────────────────────────────────
  const news: SeedNews[] = [];
  const publish = (
    id: string,
    target: SeedChild,
    publishedAt: Date,
    content: { title: string; body: string },
    attachment: { kind: MediaKind; mimeType: string; label: string; durationSec?: number },
  ) => {
    const author = relaisOf(target);
    news.push({
      id,
      relaisId: author.relais.id,
      authorUserId: author.id,
      type: "ONE_CHILD",
      status: "PUBLISHED",
      ...content,
      notifyParrains: true,
      notifyBureau: false,
      // La rentrée d'Aïcha est aussi montrée aux enfants, pendant leur session.
      visibleToChildren: id === "seed-news-aicha-rentree",
      scheduledAt: null,
      publishedAt,
      sentFrom: news.length % 2 === 0 ? "MOBILE" : "WEB",
      createdAt: publishedAt,
      childIds: [target.id],
    });
    addMedia({
      id: id.replace("seed-news-", "seed-media-news-"),
      ...attachment,
      uploadedByUserId: author.id,
      newsPostId: id,
      createdAt: publishedAt,
    });
  };

  publish(
    "seed-news-aicha-rentree",
    aicha,
    at(ago(19), 9),
    {
      title: "Nouvelle de rentrée",
      body: "Aïcha a fait sa rentrée en CM2. Son kit scolaire a été acheté grâce à votre parrainage : cahiers, uniforme et sandales. Elle est déléguée de classe cette année.",
    },
    { kind: "VIDEO", mimeType: "video/mp4", label: "Vidéo · 0:42", durationSec: 42 },
  );
  publish(
    "seed-news-kofi-vacances",
    kofi,
    at(ago(64), 10),
    {
      title: "Fin des vacances",
      body: "Kofi a passé les vacances chez sa grand-mère, à Aného. Il a hâte de retrouver sa classe de CE2.",
    },
    { kind: "PHOTO", mimeType: "image/jpeg", label: photoOf("Kofi") },
  );
  publish(
    "seed-news-yao-college",
    child("yao"),
    at(ago(35), 11),
    {
      title: "Rentrée au collège",
      body: "Yao est entré en 5e au collège de Bè. Il a reçu ses manuels de français et de mathématiques.",
    },
    { kind: "PHOTO", mimeType: "image/jpeg", label: photoOf("Yao") },
  );
  publish(
    "seed-news-mariam-jardin",
    child("mariam"),
    at(ago(6), 9, 30),
    {
      title: "Le jardin de l'école",
      body: "Mariam a planté des tomates et du gombo avec sa classe de CM1 dans le jardin de l'école.",
    },
    { kind: "PHOTO", mimeType: "image/jpeg", label: photoOf("Mariam") },
  );
  publish(
    "seed-news-ibrahim-cours-du-soir",
    child("ibrahim"),
    at(ago(25), 10),
    NEWS_TEMPLATES[1]!(child("ibrahim")),
    { kind: "PHOTO", mimeType: "image/jpeg", label: photoOf("Ibrahim") },
  );

  // Lomé : 9 nouvelles ce mois-ci (11 avec Aïcha et Mariam), 4 enfants sans nouvelle depuis
  // plus de 60 jours (5 avec Kofi). Kara et Kpalimé : une nouvelle de moins de 2 mois.
  const recentDays = [2, 3, 5, 8, 11, 14, 17, 23, 27];
  const staleDays = [70, 82, 95, 120];
  const sponsoredIds = new Set(data.sponsorships.map((s) => s.childId));
  const generated = data.children.filter(
    (c) => /^seed-child-(koffi|diallo|agbeko)-\d+$/.test(c.id) && sponsoredIds.has(c.id),
  );
  const lome = generated.filter((c) => c.id.startsWith("seed-child-koffi-"));
  const staleSlugs = new Set(["koffi-4", "koffi-9", "koffi-11", "koffi-13"]);
  let recentIndex = 0;
  let staleIndex = 0;
  generated.forEach((c, index) => {
    const slug = slugOf(c.id);
    let days: number;
    if (lome.includes(c)) {
      days = staleSlugs.has(slug) ? staleDays[staleIndex++]! : recentDays[recentIndex++]!;
    } else {
      days = random.int(3, 55);
    }
    publish(
      `seed-news-${slug}`,
      c,
      at(ago(days), 8 + (index % 9), (index * 7) % 60),
      NEWS_TEMPLATES[index % NEWS_TEMPLATES.length]!(c),
      { kind: "PHOTO", mimeType: "image/jpeg", label: photoOf(c.firstName) },
    );
  });

  // ─── Photos de profil (emplacements réservés) ──────────────────────────────
  const childPhotos = data.children.map((c) => ({
    childId: c.id,
    mediaId: `seed-media-photo-${slugOf(c.id)}`,
  }));
  for (const { childId, mediaId } of childPhotos) {
    const c = data.children.find((x) => x.id === childId)!;
    addMedia({
      id: mediaId,
      kind: "AVATAR",
      mimeType: "image/jpeg",
      label: photoOf(c.firstName),
      uploadedByUserId: c.createdById,
      createdAt: at(c.submittedAt ?? today, 9),
    });
  }

  // ─── Versements ────────────────────────────────────────────────────────────
  const payments: SeedPayment[] = [];
  const inactive = sponsorshipOf("ibrahim", "sophie2");
  for (const s of data.sponsorships.filter((x) => x.status === "ACTIVE")) {
    const parrain = parrainOf(s);
    const debitDay = parrain.profile.debitDay;
    // Mois numérotés en continu (année × 12 + mois) : premier prélèvement après le début du binôme.
    const startMonth = s.startDate.getUTCFullYear() * 12 + s.startDate.getUTCMonth();
    const firstMonth = Math.max(
      utcDay(s.startDate.getUTCFullYear(), s.startDate.getUTCMonth(), debitDay) < s.startDate
        ? startMonth + 1
        : startMonth,
      PAYMENTS_SINCE.year * 12 + PAYMENTS_SINCE.month,
    );
    const currentMonth = today.getUTCFullYear() * 12 + today.getUTCMonth();
    const own: SeedPayment[] = [];
    // Jusqu'au mois du jour du seed : échues reçues, la suivante programmée.
    for (let index = firstMonth; index <= currentMonth; index += 1) {
      const dueDate = utcDay(Math.floor(index / 12), index % 12, debitDay);
      const periodKey = periodKeyOf(dueDate);
      const due = dueDate.getTime() <= today.getTime();
      own.push({
        id: `seed-payment-${slugOf(s.id)}-${periodKey}`,
        parrainId: s.parrainId,
        sponsorshipId: s.id,
        childId: s.childId,
        kind: "MONTHLY",
        amountCents: s.monthlyAmountCents,
        method: "SEPA_DEBIT",
        label: null,
        dueDate,
        paidAt: due ? at(dueDate, 8) : null,
        status: due ? "RECEIVED" : "SCHEDULED",
        reference: `PRL-${periodKey.replace("-", "")}-${slugOf(s.id).toUpperCase()}`,
        periodKey,
      });
    }
    // Homonyme inactive : les deux dernières mensualités échues sont en retard.
    if (s.id === inactive.id) {
      for (const late of own.filter((p) => p.status === "RECEIVED").slice(-2)) {
        late.status = "LATE";
        late.paidAt = null;
      }
    }
    payments.push(...own);
  }
  const donDate = utcDay(today.getUTCFullYear(), 8, 15);
  const donDue = donDate.getTime() <= today.getTime();
  payments.push({
    id: "seed-payment-claire-don-rentree",
    parrainId: claireAicha.parrainId,
    sponsorshipId: claireAicha.id,
    childId: aicha.id,
    kind: "ONE_OFF",
    amountCents: 4000,
    method: "CARD",
    label: "Don ponctuel · rentrée",
    dueDate: donDate,
    paidAt: donDue ? at(donDate, 10) : null,
    status: donDue ? "RECEIVED" : "SCHEDULED",
    reference: `DON-${periodKeyOf(donDate).replace("-", "")}-CLAIRE-RENTREE`,
    periodKey: null,
  });

  // Accords recueillis par le relais à l'ouverture de chaque dossier.
  const consents: SeedConsent[] = data.children.flatMap((c) => {
    const grantedAt = c.submittedAt ?? today;
    const record = (type: SeedConsent["type"]): SeedConsent => ({
      id: `seed-consent-${slugOf(c.id)}-${type.toLowerCase()}`,
      childId: c.id,
      type,
      textVersion: CONSENT_TEXT_VERSION,
      recordedById: c.createdById,
      grantedAt,
    });
    return [
      ...(c.consentSponsorship ? [record("SPONSORSHIP")] : []),
      ...(c.consentMedia ? [record("MEDIA")] : []),
    ];
  });

  return {
    periods,
    results,
    news,
    consents,
    conversations,
    messages,
    media,
    childPhotos,
    payments,
    uploads: [
      {
        mediaId: bulletinMediaId,
        storageKey: bulletinKey,
        contentType: "application/pdf",
        body: bulletinPdf,
      },
    ],
  };
}
