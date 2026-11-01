// Seed de démonstration, idempotent : `npm run db:seed` (ou `db:reset`). Réservé au développement.
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/prisma/client.js";
import { buildSeedData, type SeedUser } from "./seed/data.js";
import { seedToday } from "./seed/dates.js";

const today = seedToday(process.env.SEED_TODAY);
const password = process.env.SEED_DEFAULT_PASSWORD ?? "motdepasse";
// Un seul hachage scrypt (lent en JavaScript pur), partagé par tous les comptes de démonstration.
let passwordHash: Promise<string> | undefined;

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

  await prisma.appSetting.upsert({
    where: { key: "seed.version" },
    update: { value: 1 },
    create: { key: "seed.version", value: 1 },
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
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
