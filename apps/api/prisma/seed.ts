// Seed de démonstration, idempotent : `npm run db:seed` (ou `db:reset`). Réservé au développement.
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { hashPassword } from "better-auth/crypto";
import { getEnv } from "../src/config/env.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/prisma/client.js";
import { hashChildCode } from "../src/relais/child-code.js";
import { createS3Client } from "../src/storage/s3-client.js";
import { buildSeedContent, type SeedContent, type SeedUpload } from "./seed/content.js";
import { buildSeedData, type SeedUser } from "./seed/data.js";
import { seedToday } from "./seed/dates.js";
import { buildSeedCalls } from "./seed/calls.js";
import { buildSeedSessions, seedChildCode } from "./seed/sessions.js";

// Jour de référence : SEED_TODAY, sinon le jour de l'horloge figée APP_NOW, sinon aujourd'hui.
const today = seedToday(process.env.SEED_TODAY || process.env.APP_NOW);
const password = process.env.SEED_DEFAULT_PASSWORD ?? "motdepasse";
// Un seul hachage scrypt (lent en JavaScript pur), partagé par tous les comptes de démonstration.
let passwordHash: Promise<string> | undefined;

/** Préfixe des identifiants créés par le seed : seules ces lignes sont réécrites ou supprimées. */
const SEED_PREFIX = "seed-";

/** Compte Better Auth : utilisateur + identifiant « credential » (mot de passe haché en scrypt). */
async function upsertUser(user: SeedUser): Promise<void> {
  const fields = { name: user.name, role: user.role, emailVerified: true, banned: false };
  const { id: userId } = await prisma.user.upsert({
    where: { email: user.email },
    update: fields,
    create: { id: user.id, email: user.email, ...fields },
    select: { id: true },
  });
  const hash = await (passwordHash ??= hashPassword(password));
  const accountId = `seed-account-${user.id.replace("seed-user-", "")}`;
  await prisma.account.upsert({
    where: { id: accountId },
    update: { password: hash },
    create: {
      id: accountId,
      userId,
      accountId: userId,
      providerId: "credential",
      password: hash,
    },
  });
}

/** Requêtes groupées en transactions (bien plus rapide qu'une requête à la fois). */
async function inBatches<T>(
  items: readonly T[],
  run: (item: T) => Prisma.PrismaPromise<unknown>,
): Promise<void> {
  const size = 200;
  for (let start = 0; start < items.length; start += size) {
    await prisma.$transaction(items.slice(start, start + size).map(run));
  }
}

/**
 * Dépose les fichiers réels (bulletin PDF) dans le stockage. Stockage indisponible : un
 * avertissement, et les médias concernés restent des emplacements réservés.
 */
async function uploadFiles(uploads: readonly SeedUpload[]): Promise<Set<string>> {
  const env = getEnv();
  const client = createS3Client({
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    endpoint: env.S3_ENDPOINT,
  });
  const uploaded = new Set<string>();
  try {
    for (const upload of uploads) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: upload.storageKey,
          Body: upload.body,
          ContentType: upload.contentType,
          ContentLength: upload.body.length,
        }),
        { abortSignal: AbortSignal.timeout(5000) },
      );
      uploaded.add(upload.mediaId);
    }
  } catch (error) {
    console.warn(
      `Stockage indisponible (${error instanceof Error ? error.message : String(error)}) : ` +
        "le bulletin PDF reste un emplacement réservé (PLACEHOLDER). Relancez le seed une fois " +
        "RustFS démarré (npm run db:up).",
    );
  } finally {
    client.destroy();
  }
  return uploaded;
}

/** Supprime les lignes du seed qui n'existent plus dans les données (autre SEED_TODAY…). */
const stale = (ids: readonly string[]) => ({
  AND: [{ id: { startsWith: SEED_PREFIX } }, { id: { notIn: [...ids] } }],
});

async function seedContent(content: SeedContent): Promise<{ uploaded: number }> {
  const uploaded = await uploadFiles(content.uploads);
  const media = content.media.map((m) =>
    m.status === "READY" && !uploaded.has(m.id)
      ? { ...m, status: "PLACEHOLDER" as const, storageKey: null, sizeBytes: null }
      : m,
  );

  // Messages laissés par des tests e2e interrompus (clé d'idempotence « e2e-… ») : supprimés,
  // pour que les non-lus du seed restent ceux de la maquette. Les autres ajouts sont conservés,
  // sauf pour les suites de tests (SEED_RESET_MESSAGES=1) : elles comparent les conversations de
  // démonstration à la maquette, sans message ajouté à la main.
  const resetDemoConversations = process.env.SEED_RESET_MESSAGES === "1";
  const leftovers = await prisma.message.findMany({
    where: {
      OR: [
        { idempotencyKey: { contains: ":e2e-" } },
        ...(resetDemoConversations
          ? [
              {
                conversationId: { startsWith: SEED_PREFIX },
                NOT: { id: { startsWith: SEED_PREFIX } },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  if (leftovers.length > 0) {
    const ids = leftovers.map((m) => m.id);
    await prisma.media.deleteMany({ where: { messageId: { in: ids } } });
    await prisma.message.deleteMany({ where: { id: { in: ids } } });
  }

  // Ce que les tests web ont créé : enfants et écoles au nom « E2e… », nouvelles à clé « e2e-… ».
  const testChildren = { firstName: { startsWith: "E2e" } };
  await prisma.schoolResult.deleteMany({ where: { child: testChildren } });
  await prisma.child.deleteMany({ where: testChildren });
  await prisma.school.deleteMany({ where: { shortName: { startsWith: "E2e" } } });
  const testNews = { idempotencyKey: { contains: ":e2e-" } };
  await prisma.media.deleteMany({ where: { newsPost: testNews } });
  await prisma.newsPost.deleteMany({ where: testNews });

  await prisma.consentRecord.deleteMany({ where: stale(content.consents.map((c) => c.id)) });
  await inBatches(content.consents, ({ id, ...fields }) =>
    prisma.consentRecord.upsert({
      where: { id },
      update: { ...fields, withdrawnAt: null },
      create: { id, ...fields },
    }),
  );

  await prisma.media.deleteMany({ where: stale(media.map((m) => m.id)) });
  await prisma.message.deleteMany({ where: stale(content.messages.map((m) => m.id)) });
  await prisma.newsPost.deleteMany({ where: stale(content.news.map((n) => n.id)) });
  await prisma.payment.deleteMany({ where: stale(content.payments.map((p) => p.id)) });
  await prisma.schoolResult.deleteMany({ where: stale(content.results.map((r) => r.id)) });
  await prisma.academicPeriod.deleteMany({
    where: { ...stale(content.periods.map((p) => p.id)), results: { none: {} } },
  });

  await inBatches(content.periods, ({ id, ...fields }) =>
    prisma.academicPeriod.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  await inBatches(content.results, ({ id, ...fields }) =>
    prisma.schoolResult.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  await inBatches(content.news, ({ id, childIds: _childIds, ...fields }) =>
    prisma.newsPost.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  await prisma.newsPostChild.deleteMany({
    where: {
      OR: content.news.map((n) => ({ newsPostId: n.id, childId: { notIn: n.childIds } })),
    },
  });
  await inBatches(
    content.news.flatMap((n) => n.childIds.map((childId) => ({ newsPostId: n.id, childId }))),
    (link) =>
      prisma.newsPostChild.upsert({
        where: { newsPostId_childId: link },
        update: {},
        create: link,
      }),
  );
  await inBatches(content.conversations, ({ id, participants: _participants, ...fields }) =>
    prisma.conversation.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  await inBatches(
    content.conversations.flatMap((c) =>
      c.participants.map((p) => ({ ...p, conversationId: c.id })),
    ),
    ({ id, ...fields }) =>
      prisma.conversationParticipant.upsert({
        where: { id },
        update: fields,
        create: { id, ...fields },
      }),
  );
  await inBatches(content.messages, ({ id, ...fields }) =>
    prisma.message.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  await inBatches(media, ({ id, ...fields }) =>
    prisma.media.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  await inBatches(content.childPhotos, ({ childId, mediaId }) =>
    prisma.child.update({ where: { id: childId }, data: { photoMediaId: mediaId } }),
  );
  await inBatches(content.payments, ({ id, ...fields }) =>
    prisma.payment.upsert({ where: { id }, update: fields, create: { id, ...fields } }),
  );
  return { uploaded: uploaded.size };
}

/**
 * Sessions élèves et codes image des enfants de M. Koffi (Aïcha garde celui du design). Les
 * sessions laissées par les tests et les verrous repartent de zéro : aucun poste ne reste ouvert.
 */
async function seedSessions(data: ReturnType<typeof buildSeedData>): Promise<void> {
  const sessions = buildSeedSessions(today, data);
  const resetTests = process.env.SEED_RESET_MESSAGES === "1";
  await prisma.classSession.deleteMany({
    where: {
      OR: [
        { status: "OPEN" },
        { id: { startsWith: SEED_PREFIX, notIn: sessions.map((session) => session.id) } },
        ...(resetTests ? [{ NOT: { id: { startsWith: SEED_PREFIX } } }] : []),
      ],
    },
  });
  await prisma.child.updateMany({ data: { failedCodeAttempts: 0, codeLockedAt: null } });
  const pepper = getEnv().CHILD_CODE_PEPPER;
  const koffiChildren = data.children.filter((child) => child.relaisId === "seed-relais-koffi");
  for (const [index, child] of koffiChildren.entries()) {
    await prisma.child.update({
      where: { id: child.id },
      data: {
        codeHash: await hashChildCode(seedChildCode(child.id, index), pepper),
        codeSetAt: today,
      },
    });
  }
  for (const { id, childIds, ...fields } of sessions) {
    await prisma.classSession.upsert({
      where: { id },
      update: { ...fields, failedAttempts: 0, suspendedAt: null, deviceTokenHash: null },
      create: { id, ...fields },
    });
    await prisma.classSessionChild.deleteMany({ where: { sessionId: id } });
    await prisma.classSessionChild.createMany({
      data: childIds.map((childId) => ({ sessionId: id, childId })),
    });
  }
  // Conversations créées par les tests (fils vers l'association, demandes d'appel d'un parrain
  // qui n'avait pas encore écrit à son relais…) : la démonstration n'en contient aucune autre.
  if (resetTests) {
    await prisma.conversation.deleteMany({ where: { NOT: { id: { startsWith: SEED_PREFIX } } } });
    await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "messages:child:" } } });
  }
}

/**
 * Créneaux, demandes et appels vidéo de M. Koffi. Ceux que les tests ont créés repartent
 * (SEED_RESET_MESSAGES) ; les autres ajouts sont gardés.
 */
async function seedCalls(data: ReturnType<typeof buildSeedData>): Promise<void> {
  const { slots, requests, calls, requestMessage } = buildSeedCalls(today, data);
  const resetTests = process.env.SEED_RESET_MESSAGES === "1";
  const scope = (ids: readonly string[]) => ({
    OR: [
      { id: { startsWith: SEED_PREFIX, notIn: [...ids] } },
      ...(resetTests ? [{ NOT: { id: { startsWith: SEED_PREFIX } } }] : []),
    ],
  });
  await prisma.videoCall.deleteMany({ where: scope(calls.map((c) => c.id)) });
  await prisma.callRequest.deleteMany({ where: scope(requests.map((r) => r.id)) });
  await prisma.callSlot.deleteMany({ where: scope(slots.map((s) => s.id)) });
  // Ordre : créneaux libres, demandes, puis créneaux réservés pour elles, puis appels.
  for (const { id, heldForId: _heldForId, ...fields } of slots) {
    await prisma.callSlot.upsert({
      where: { id },
      update: { ...fields, heldForId: null },
      create: { id, ...fields, heldForId: null },
    });
  }
  for (const { id, ...fields } of requests) {
    await prisma.callRequest.upsert({ where: { id }, update: fields, create: { id, ...fields } });
  }
  for (const { id, heldForId } of slots) {
    await prisma.callSlot.update({ where: { id }, data: { heldForId } });
  }
  for (const { id, ...fields } of calls) {
    await prisma.videoCall.upsert({ where: { id }, update: fields, create: { id, ...fields } });
  }
  await prisma.message.update({
    where: { id: requestMessage.messageId },
    data: { kind: "CALL_REQUEST", callRequestId: requestMessage.requestId },
  });
}

async function main() {
  const data = buildSeedData(today);

  await upsertUser(data.bureau);

  for (const relais of data.relais) {
    await upsertUser(relais);
    const { id, ...fields } = relais.relais;
    await prisma.relais.upsert({
      where: { id },
      update: fields,
      create: { id, userId: relais.id, ...fields },
    });
  }

  for (const school of data.schools) {
    const { id, ...fields } = school;
    await prisma.school.upsert({ where: { id }, update: fields, create: school });
  }

  for (const parrain of data.parrains) {
    await upsertUser(parrain);
    const { id, ...fields } = parrain.profile;
    await prisma.parrainProfile.upsert({
      where: { id },
      update: fields,
      create: { id, userId: parrain.id, ...fields },
    });
  }

  for (const child of data.children) {
    const { id, ...fields } = child;
    await prisma.child.upsert({ where: { id }, update: fields, create: child });
  }

  for (const sponsorship of data.sponsorships) {
    const { id, ...fields } = sponsorship;
    await prisma.sponsorship.upsert({ where: { id }, update: fields, create: sponsorship });
  }

  const content = buildSeedContent(today, data);
  const { uploaded } = await seedContent(content);
  await seedSessions(data);
  await seedCalls(data);

  // Compteurs d'envoi de messages des comptes de démonstration remis à zéro (tests répétés).
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "messages:seed-user-" } } });

  await prisma.appSetting.upsert({
    where: { key: "seed.version" },
    update: { value: 3 },
    create: { key: "seed.version", value: 3 },
  });

  const activeChildIds = new Set(
    data.sponsorships.filter((s) => s.status === "ACTIVE").map((s) => s.childId),
  );
  const perRelais = data.relais
    .map((r) => {
      const count = data.children.filter((c) => c.relaisId === r.relais.id).length;
      return `${r.name} ${count}`;
    })
    .join(", ");
  console.log(`Seed terminé (jour de référence ${today.toISOString().slice(0, 10)}) :`);
  console.log(
    `  ${data.parrains.length} parrains, ${data.relais.length} relais, 1 bureau ` +
      `(mot de passe : « ${password} »)`,
  );
  console.log(`  ${data.schools.length} écoles, ${data.children.length} enfants (${perRelais})`);
  console.log(
    `  ${data.sponsorships.length} binômes actifs, ` +
      `${data.children.length - activeChildIds.size} enfants en attente de parrain`,
  );
  console.log(
    `  ${content.news.length} nouvelles, ${content.messages.length} messages, ` +
      `${content.conversations.length} conversations ` +
      `(${content.conversations.filter((c) => c.kind !== "SPONSORSHIP").length} entre adultes), ` +
      `${content.results.length} résultats, ` +
      `${content.payments.length} versements, ${content.media.length} médias ` +
      `(${uploaded} fichier${uploaded > 1 ? "s" : ""} déposé${uploaded > 1 ? "s" : ""})`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
